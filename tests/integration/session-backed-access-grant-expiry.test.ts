import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { isBrowserSessionActiveAt } from "../../src/domain/index.js";
import { DEPLOYMENT_A, THREAD_A } from "../helpers/workflow-fixture.js";
import {
  issueExternalGrant,
  makeExternalSessionFixture,
} from "../helpers/external-session-fixture.js";

it("denies an expired AccessGrant while the independent browser session is still active", async () => {
  const fixture = makeExternalSessionFixture();
  const grant = await issueExternalGrant(fixture, ["THREAD_READ"], 900);
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
  const session = await fixture.sessions.exchangeBootstrapProof({
    deploymentId: DEPLOYMENT_A,
    bootstrapId: challenge.bootstrapId,
    expectedOrigin: "https://secure.example.test",
    formGuard: guard.guard,
    proof: challenge.proof,
  });

  fixture.clock.set("2026-08-14T12:14:59.999Z");
  const binding = await fixture.sessions.presentBrowserSession({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    sessionId: session.sessionId,
    bearer: session.bearer,
  });
  fixture.clock.set("2026-08-14T12:15:00.000Z");
  const storedSession = await fixture.sessionStore.getBrowserSession(
    DEPLOYMENT_A,
    session.sessionId,
  );
  expect(storedSession).toBeDefined();
  expect(
    isBrowserSessionActiveAt(storedSession!, "2026-08-14T12:15:00.000Z"),
  ).toBe(true);

  try {
    await fixture.sessionAccess.validateOperation(binding, "THREAD_READ");
    throw new Error("Expected expired AccessGrant denial.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe("EXTERNAL_ACCESS_DENIED");
  }
});
