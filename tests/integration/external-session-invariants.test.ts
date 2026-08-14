import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { DEPLOYMENT_A, THREAD_A } from "../helpers/workflow-fixture.js";
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
  }
}

describe("Release 0.13 external delivery invariants", () => {
  it("fails the bootstrap challenge at its exact authoritative expiry boundary", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    const challenge = await fixture.sessions.issueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 60,
    });
    fixture.clock.set("2026-08-14T12:01:00.000Z");

    await expectDenied(
      fixture.sessions.issueBootstrapFormGuard({
        deploymentId: DEPLOYMENT_A,
        bootstrapId: challenge.bootstrapId,
        expectedOrigin: "https://secure.example.test",
      }),
    );
  });

  it("denies a wrong browser-session bearer without advancing session state", async () => {
    const fixture = makeExternalSessionFixture();
    const { session } = await establishExternalSession(fixture, ["THREAD_READ"]);
    const before = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );

    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: "sxs1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
    );
    expect(
      await fixture.sessionStore.getBrowserSession(
        DEPLOYMENT_A,
        session.sessionId,
      ),
    ).toEqual(before);
  });

  it("reissue invalidates an outstanding prior challenge before publishing the replacement", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    const first = await fixture.sessions.issueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });
    fixture.clock.set("2026-08-14T12:00:30.000Z");
    const second = await fixture.sessions.reissueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });

    const old = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      first.bootstrapId,
    );
    const replacement = await fixture.sessionStore.getBootstrapChallenge(
      DEPLOYMENT_A,
      second.bootstrapId,
    );
    expect(old?.invalidationReason).toBe("REISSUED");
    expect(replacement).toMatchObject({ generation: 1, version: 1 });
    await expectDenied(
      fixture.sessions.exchangeBootstrapProof({
        deploymentId: DEPLOYMENT_A,
        bootstrapId: first.bootstrapId,
        expectedOrigin: "https://secure.example.test",
        formGuard: "sxfg1_stale.synthetic",
        proof: first.proof,
      }),
    );
  });

  it("does not fabricate workflow evidence or lifecycle changes from bootstrap and session establishment", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    const beforeAudit = fixture.workflowStore.listAuditEvents(
      DEPLOYMENT_A,
      THREAD_A,
    );
    const beforeThread = await fixture.workflowStore.getThread(
      DEPLOYMENT_A,
      THREAD_A,
    );
    const challenge = await fixture.sessions.issueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });
    const guard = await fixture.sessions.issueBootstrapFormGuard({
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
    });
    await fixture.sessions.exchangeBootstrapProof({
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
      formGuard: guard.guard,
      proof: challenge.proof,
    });

    expect(fixture.workflowStore.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeAudit,
    );
    expect(await fixture.workflowStore.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeThread,
    );
  });

  it("does not let BootstrapFormGuard possession substitute for a browser session or AccessGrant operation", async () => {
    const fixture = makeExternalSessionFixture();
    const grant = await issueExternalGrant(fixture, ["THREAD_READ"]);
    const challenge = await fixture.sessions.issueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });
    const guard = await fixture.sessions.issueBootstrapFormGuard({
      deploymentId: DEPLOYMENT_A,
      bootstrapId: challenge.bootstrapId,
      expectedOrigin: "https://secure.example.test",
    });

    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        sessionId: "browser-session-not-established",
        bearer: guard.guard,
      }),
    );
  });
});
