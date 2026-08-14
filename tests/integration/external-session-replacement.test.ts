import { expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { DEPLOYMENT_A, THREAD_A } from "../helpers/workflow-fixture.js";
import {
  establishExternalSession,
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

it("atomically replaces the prior active session when a new valid session is established for the same AccessGrant", async () => {
  const fixture = makeExternalSessionFixture();
  const first = await establishExternalSession(fixture, ["THREAD_READ"]);

  fixture.clock.set("2026-08-14T12:01:00.000Z");
  const challenge = await fixture.sessions.issueBootstrapChallenge({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    accessGrantId: first.grant.grantId,
    verificationMode: "MAILBOX_ONLY",
    requestedLifetimeSeconds: 900,
  });
  const guard = await fixture.sessions.issueBootstrapFormGuard({
    deploymentId: DEPLOYMENT_A,
    bootstrapId: challenge.bootstrapId,
    expectedOrigin: "https://secure.example.test",
  });
  const replacement = await fixture.sessions.exchangeBootstrapProof({
    deploymentId: DEPLOYMENT_A,
    bootstrapId: challenge.bootstrapId,
    expectedOrigin: "https://secure.example.test",
    formGuard: guard.guard,
    proof: challenge.proof,
  });

  const sessions = await fixture.sessionStore.listBrowserSessionsForAccessGrant(
    DEPLOYMENT_A,
    first.grant.grantId,
  );
  const oldSession = sessions.find(
    (session) => session.sessionId === first.session.sessionId,
  );
  const newSession = sessions.find(
    (session) => session.sessionId === replacement.sessionId,
  );

  expect(oldSession).toMatchObject({
    invalidationReason: "REPLACED",
    invalidatedAt: "2026-08-14T12:01:00.000Z",
  });
  expect(newSession?.invalidatedAt).toBeUndefined();
  expect(sessions.filter((session) => session.invalidatedAt === undefined)).toHaveLength(
    1,
  );

  await expectDenied(
    fixture.sessions.presentBrowserSession({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      sessionId: first.session.sessionId,
      bearer: first.session.bearer,
    }),
  );
  await expect(
    fixture.sessions.presentBrowserSession({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      sessionId: replacement.sessionId,
      bearer: replacement.bearer,
    }),
  ).resolves.toMatchObject({
    accessGrantId: first.grant.grantId,
    sessionId: replacement.sessionId,
  });
});
