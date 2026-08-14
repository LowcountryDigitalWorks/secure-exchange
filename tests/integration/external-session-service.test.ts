import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { DEPLOYMENT_A, THREAD_A, actorContext } from "../helpers/workflow-fixture.js";
import {
  establishExternalSession,
  issueExternalGrant,
  makeExternalSessionFixture,
} from "../helpers/external-session-fixture.js";

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error("Expected external access denial.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe("EXTERNAL_ACCESS_DENIED");
    expect(String((error as Error).message)).not.toMatch(/sxp1_|sxs1_|sxfg1_/u);
  }
}

async function issueChallenge(fixture: ReturnType<typeof makeExternalSessionFixture>) {
  const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
  const challenge = await fixture.sessions.issueBootstrapChallenge({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    accessGrantId: grant.grantId,
    verificationMode: "MAILBOX_ONLY",
    requestedLifetimeSeconds: 900,
  });
  return { grant, challenge };
}

async function issueGuard(
  fixture: ReturnType<typeof makeExternalSessionFixture>,
  bootstrapId: string,
) {
  return fixture.sessions.issueBootstrapFormGuard({
    deploymentId: DEPLOYMENT_A,
    bootstrapId,
    expectedOrigin: "https://secure.example.test",
  });
}

describe("Release 0.13 bootstrap and browser-session core", () => {
  it("returns the raw proof once while persisting only a keyed verifier and bounded challenge metadata", async () => {
    const fixture = makeExternalSessionFixture();
    const { challenge } = await issueChallenge(fixture);
    const stored = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );

    expect(challenge.proof).toMatch(/^sxp1_[A-Za-z0-9_-]{11}$/u);
    expect(stored).toMatchObject({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      generation: 1,
      version: 1,
      failedAttempts: 0,
      maxAttempts: 5,
      proofVerifierAlgorithm: "HMAC-SHA-256",
      proofVerifierVersion: 1,
    });
    expect(stored?.proofVerifierDigest).toMatch(
      /^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u,
    );
    const persisted = JSON.stringify(stored);
    expect(persisted).not.toContain(challenge.proof);
    const audit = JSON.stringify(
      fixture.workflowStore.listAuditEvents(DEPLOYMENT_A, THREAD_A),
    );
    expect(audit).not.toContain(challenge.proof);
    expect(audit).not.toContain(stored?.proofVerifierDigest ?? "never");
  });

  it("denies bootstrap issuance after the associated AccessGrant is revoked", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    await fixture.accessGrants.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: grant.grantId,
      expectedVersion: 1,
    });

    await expectDenied(
      fixture.sessions.issueBootstrapChallenge({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        accessGrantId: grant.grantId,
        verificationMode: "MAILBOX_ONLY",
        requestedLifetimeSeconds: 900,
      }),
    );
  });

  it("issues a stateless guard without mutating challenge generation and never lets it outlive the challenge", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    const challenge = await fixture.sessions.issueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 300,
    });
    const before = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    const guard = await issueGuard(fixture, challenge.bootstrapId);
    const after = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );

    expect(guard.expiresAt).toBe(challenge.expiresAt);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain(guard.guard);
  });

  it("advances failed-attempt count and generation, making the submitted guard stale", async () => {
    const fixture = makeExternalSessionFixture();
    const { challenge } = await issueChallenge(fixture);
    const guard = await issueGuard(fixture, challenge.bootstrapId);

    await expectDenied(
      fixture.sessions.exchangeBootstrapProof({
        deploymentId: DEPLOYMENT_A,
        bootstrapId: challenge.bootstrapId,
        expectedOrigin: "https://secure.example.test",
        formGuard: guard.guard,
        proof: "sxp1_AAAAAAAAAAA",
      }),
    );
    const after = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    expect(after).toMatchObject({ failedAttempts: 1, generation: 2, version: 2 });

    await expectDenied(
      fixture.sessions.exchangeBootstrapProof({
        deploymentId: DEPLOYMENT_A,
        bootstrapId: challenge.bootstrapId,
        expectedOrigin: "https://secure.example.test",
        formGuard: guard.guard,
        proof: challenge.proof,
      }),
    );

    const freshGuard = await issueGuard(fixture, challenge.bootstrapId);
    const session = await fixture.sessions.exchangeBootstrapProof({
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
      formGuard: freshGuard.guard,
      proof: challenge.proof,
    });
    expect(session.bearer).toMatch(/^sxs1_[A-Za-z0-9_-]{43}$/u);
  });

  it("locks exactly on the fifth authoritative failed proof and denies further attempts", async () => {
    const fixture = makeExternalSessionFixture();
    const { challenge } = await issueChallenge(fixture);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const guard = await issueGuard(fixture, challenge.bootstrapId);
      await expectDenied(
        fixture.sessions.exchangeBootstrapProof({
          deploymentId: DEPLOYMENT_A,
          bootstrapId: challenge.bootstrapId,
          expectedOrigin: "https://secure.example.test",
          formGuard: guard.guard,
          proof: "sxp1_AAAAAAAAAAA",
        }),
      );
      const current = await fixture.sessionStore.getBootstrapChallenge(
        DEPLOYMENT_A,
        challenge.bootstrapId,
      );
      expect(current?.failedAttempts).toBe(attempt);
      expect(current?.generation).toBe(attempt + 1);
    }

    const locked = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    expect(locked).toMatchObject({
      failedAttempts: 5,
      invalidationReason: "LOCKED",
    });
    await expectDenied(issueGuard(fixture, challenge.bootstrapId));
  });

  it("atomically consumes a challenge and creates one fresh session without persisting bearer material", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, challenge, session } = await establishExternalSession(fixture);
    const storedChallenge = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    const storedSession = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );

    expect(storedChallenge?.consumedAt).toBe(session.establishedAt);
    expect(storedSession).toMatchObject({
      accessGrantId: grant.grantId,
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      version: 1,
    });
    expect(storedSession?.verifierDigest).toMatch(
      /^sha256:v1:[A-Za-z0-9_-]{43}$/u,
    );
    const serialized = JSON.stringify({ storedChallenge, storedSession });
    expect(serialized).not.toContain(challenge.proof);
    expect(serialized).not.toContain(session.bearer);
  });

  it("rolls back challenge consumption and session creation together on transaction failure", async () => {
    const fixture = makeExternalSessionFixture();
    const { challenge } = await issueChallenge(fixture);
    const guard = await issueGuard(fixture, challenge.bootstrapId);
    fixture.sessionStore.failNextCommit();

    await expectDenied(
      fixture.sessions.exchangeBootstrapProof({
        deploymentId: DEPLOYMENT_A,
        bootstrapId: challenge.bootstrapId,
        expectedOrigin: "https://secure.example.test",
        formGuard: guard.guard,
        proof: challenge.proof,
      }),
    );
    const storedChallenge = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    expect(storedChallenge).toMatchObject({ generation: 1, version: 1 });
    expect(storedChallenge?.consumedAt).toBeUndefined();
    expect(
      await fixture.sessionStore.listBrowserSessionsForAccessGrant(
        DEPLOYMENT_A,
        (await issueExternalGrant(makeExternalSessionFixture())).grantId,
      ),
    ).toEqual([]);
  });

  it("accepts at most one authoritative failed attempt for a concurrently replayed generation", async () => {
    const fixture = makeExternalSessionFixture();
    const { challenge } = await issueChallenge(fixture);
    const guard = await issueGuard(fixture, challenge.bootstrapId);
    const input = {
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
      formGuard: guard.guard,
      proof: "sxp1_AAAAAAAAAAA",
    } as const;

    const results = await Promise.allSettled([
      fixture.sessions.exchangeBootstrapProof(input),
      fixture.sessions.exchangeBootstrapProof(input),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    const stored = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      challenge.bootstrapId,
    );
    expect(stored).toMatchObject({ failedAttempts: 1, generation: 2, version: 2 });
  });

  it("allows only one concurrent valid submission to consume a challenge and establish a session", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, challenge } = await issueChallenge(fixture);
    const guard = await issueGuard(fixture, challenge.bootstrapId);
    const input = {
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
      formGuard: guard.guard,
      proof: challenge.proof,
    } as const;

    const results = await Promise.allSettled([
      fixture.sessions.exchangeBootstrapProof(input),
      fixture.sessions.exchangeBootstrapProof(input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const sessions = await fixture.sessionStore.listBrowserSessionsForAccessGrant(
      DEPLOYMENT_A,
      grant.grantId,
    );
    expect(sessions.filter((session) => session.invalidatedAt === undefined)).toHaveLength(
      1,
    );
  });

  it("fails at the exact idle boundary and ignores caller time because only the injected clock is authoritative", async () => {
    const fixture = makeExternalSessionFixture();
    const { session } = await establishExternalSession(fixture);
    fixture.clock.set("2026-08-14T12:10:00.000Z");

    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
  });

  it("advances idle activity without sliding the absolute session deadline and fails at the exact absolute boundary", async () => {
    const fixture = makeExternalSessionFixture();
    const { session } = await establishExternalSession(fixture);
    fixture.clock.set("2026-08-14T12:09:59.999Z");
    await fixture.sessions.presentBrowserSession({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      sessionId: session.sessionId,
      bearer: session.bearer,
    });
    const active = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );
    expect(active?.lastAuthorizedActivityAt).toBe("2026-08-14T12:09:59.999Z");
    expect(active?.absoluteExpiresAt).toBe("2026-08-14T12:20:00.000Z");

    fixture.clock.set("2026-08-14T12:20:00.000Z");
    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
  });

  it("invalidates server-side session state on logout without revoking the AccessGrant", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, session } = await establishExternalSession(fixture);
    await fixture.sessions.logoutBrowserSession({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      sessionId: session.sessionId,
      bearer: session.bearer,
    });

    const storedSession = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );
    const storedGrant = await fixture.workflowStore.getAccessGrant(
      DEPLOYMENT_A,
      grant.grantId,
    );
    expect(storedSession?.invalidationReason).toBe("LOGOUT");
    expect(storedGrant?.revokedAt).toBeUndefined();
    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
  });

  it("reissue atomically invalidates outstanding challenges and active sessions before creating the new challenge", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, session } = await establishExternalSession(fixture);
    fixture.clock.set("2026-08-14T12:01:00.000Z");
    const reissued = await fixture.sessions.reissueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });

    const oldSession = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );
    const challenges = await fixture.sessionStore.listBootstrapChallengesForAccessGrant(
      DEPLOYMENT_A,
      grant.grantId,
    );
    expect(oldSession?.invalidationReason).toBe("REISSUED");
    expect(challenges.filter((item) => item.invalidatedAt === undefined && item.consumedAt === undefined)).toHaveLength(1);
    expect(challenges.at(-1)?.bootstrapId).toBe(reissued.bootstrapId);
    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
  });
});
