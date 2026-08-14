import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { ValidatedBrowserSessionBinding } from "../../src/application/external-session-service.js";
import { WorkflowService } from "../../src/application/workflow-service.js";
import type { AccessGrantOperation } from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  EXTERNAL_A,
  THREAD_A,
  actorContext,
} from "../helpers/workflow-fixture.js";
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

async function bindingFor(
  fixture: ReturnType<typeof makeExternalSessionFixture>,
  operations: readonly AccessGrantOperation[],
) {
  const established = await establishExternalSession(fixture, operations);
  const binding = await fixture.sessions.presentBrowserSession({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    sessionId: established.session.sessionId,
    bearer: established.session.bearer,
  });
  return { ...established, binding };
}

describe("Release 0.13 session-backed AccessGrant authorization", () => {
  it("keeps THREAD_READ, ATTACHMENT_READ and THREAD_REPLY independent with no wildcard authority", async () => {
    const operations = [
      "THREAD_READ",
      "ATTACHMENT_READ",
      "THREAD_REPLY",
    ] as const;

    for (const granted of operations) {
      const fixture = makeExternalSessionFixture();
      const { binding } = await bindingFor(fixture, [granted]);
      await expect(
        fixture.sessionAccess.validateOperation(binding, granted),
      ).resolves.toMatchObject({ operation: granted });
      for (const denied of operations.filter((item) => item !== granted)) {
        await expectDenied(
          fixture.sessionAccess.validateOperation(binding, denied),
        );
      }
    }
  });

  it("does not allow callers to manufacture the internal validated-session authority structure", () => {
    expect(
      () =>
        new ValidatedBrowserSessionBinding(Symbol("caller"), {
          deploymentId: DEPLOYMENT_A,
          threadId: THREAD_A,
          accessGrantId: "access-grant-forged",
          sessionId: "session-forged",
          sessionVersion: 1,
          validatedAt: "2026-08-14T12:00:00.000Z",
        }),
    ).toThrow(/application-owned/u);
  });

  it("retrieves a conversation through a validated session while the old raw AccessGrant path remains usable", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, binding } = await bindingFor(fixture, ["THREAD_READ"]);

    const sessionProjection =
      await fixture.sessionAccess.retrieveExternalConversation(binding);
    const rawProjection =
      await fixture.accessGrants.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
      });

    expect(sessionProjection.messages).toHaveLength(2);
    expect(rawProjection.messages).toHaveLength(2);
    expect(sessionProjection.threadId).toBe(THREAD_A);
  });

  it("denies current operation authority after AccessGrant revocation even though browser session state remains present", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, binding, session } = await bindingFor(fixture, [
      "THREAD_READ",
    ]);
    await fixture.accessGrants.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: grant.grantId,
      expectedVersion: 1,
    });

    const storedSession = await fixture.sessionStore.getBrowserSession(
      DEPLOYMENT_A,
      session.sessionId,
    );
    expect(storedSession?.invalidatedAt).toBeUndefined();
    await expectDenied(
      fixture.sessionAccess.validateOperation(binding, "THREAD_READ"),
    );
  });

  it("denies a lifecycle-invalid operation despite a previously validated session binding", async () => {
    const fixture = makeExternalSessionFixture();
    const { binding } = await bindingFor(fixture, ["THREAD_REPLY"]);
    const workflow = new WorkflowService(fixture.workflowStore);
    await workflow.transitionThread({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-expire-thread",
      expectedVersion: 3,
      targetState: "EXPIRED",
      at: "2026-08-14T12:01:00.000Z",
    });

    await expectDenied(
      fixture.sessionAccess.validateOperation(binding, "THREAD_REPLY"),
    );
  });

  it("treats reissue as stale-session invalidation for an already validated binding", async () => {
    const fixture = makeExternalSessionFixture();
    const { grant, binding } = await bindingFor(fixture, ["THREAD_READ"]);
    fixture.clock.set("2026-08-14T12:01:00.000Z");
    await fixture.sessions.reissueBootstrapChallenge({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      accessGrantId: grant.grantId,
      verificationMode: "MAILBOX_ONLY",
      requestedLifetimeSeconds: 900,
    });

    await expectDenied(
      fixture.sessionAccess.validateOperation(binding, "THREAD_READ"),
    );
  });

  it("preserves external reply actor attribution, lifecycle independence and AccessGrantAuthorityGuard commit semantics", async () => {
    const fixture = makeExternalSessionFixture();
    const { binding } = await bindingFor(fixture, ["THREAD_REPLY"]);
    fixture.clock.set("2026-08-14T12:02:00.000Z");
    const receipt = await fixture.sessionAccess.replyExternalConversation(
      binding,
      "Synthetic session-backed reply.",
    );

    const messages = await fixture.workflowStore.listMessages(
      DEPLOYMENT_A,
      THREAD_A,
    );
    const thread = await fixture.workflowStore.getThread(
      DEPLOYMENT_A,
      THREAD_A,
    );
    const audit = fixture.workflowStore.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    const reply = messages.at(-1);

    expect(receipt).toEqual({
      threadId: THREAD_A,
      createdAt: "2026-08-14T12:02:00.000Z",
    });
    expect(reply).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      actorRef: EXTERNAL_A,
      createdAt: "2026-08-14T12:02:00.000Z",
    });
    expect(thread).toMatchObject({
      state: "IN_PROGRESS",
      lastActivityAt: "2026-08-14T12:02:00.000Z",
      attentionAt: "2026-08-14T12:02:00.000Z",
    });
    expect(audit.at(-1)).toMatchObject({
      eventType: "MESSAGE_APPENDED",
      actorRef: EXTERNAL_A,
      actorKind: "EXTERNAL",
    });
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain("Synthetic session-backed reply.");
    expect(serializedAudit).not.toContain("THREAD_OPENED");
    expect(serializedAudit).not.toContain("ATTACHMENT_DOWNLOADED");
    expect(serializedAudit).not.toContain("TRANSFER_ATTESTED");
    expect(serializedAudit).not.toContain("THREAD_COMPLETED");
  });

  it("denies wrong deployment or thread when presenting browser session credentials", async () => {
    const fixture = makeExternalSessionFixture();
    const { session } = await establishExternalSession(fixture, [
      "THREAD_READ",
    ]);

    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: "deployment-other",
        threadId: THREAD_A,
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
    await expectDenied(
      fixture.sessions.presentBrowserSession({
        deploymentId: DEPLOYMENT_A,
        threadId: "thread-other",
        sessionId: session.sessionId,
        bearer: session.bearer,
      }),
    );
  });
});
