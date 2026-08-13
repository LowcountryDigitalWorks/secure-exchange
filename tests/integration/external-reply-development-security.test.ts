import { describe, expect, it } from "vitest";

import {
  transitionThread,
  type ThreadLifecycleState,
} from "../../src/domain/thread.js";
import { EXTERNAL_RETRIEVAL_ROUTE_PREFIX } from "../../src/http/external-retrieval-development.js";
import {
  IN_MEMORY_ORIGIN,
  createExternalDemoFixture,
  createSyntheticThread,
  establishCapability,
  issueGrant,
  postForm,
} from "../helpers/external-demo-fixture.js";

async function moveThread(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  target: ThreadLifecycleState,
): Promise<void> {
  const threads = await fixture.runtime.store.listThreadsForQueue(
    fixture.runtime.deploymentId,
    fixture.runtime.queueId,
  );
  const current = threads.at(-1);
  if (current === undefined) throw new Error("Synthetic thread is missing.");
  await fixture.runtime.store.commit({
    deploymentId: fixture.runtime.deploymentId,
    threadId: current.threadId,
    expectedThreadVersion: current.version,
    nextThread: transitionThread(current, target, current.version, {
      at: fixture.runtime.now(),
    }),
  });
}

async function moveFromNew(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  target: ThreadLifecycleState,
): Promise<void> {
  if (target === "NEW") return;
  if (target === "IN_PROGRESS") return moveThread(fixture, "IN_PROGRESS");
  if (target === "AWAITING_EXTERNAL") {
    await moveThread(fixture, "IN_PROGRESS");
    return moveThread(fixture, "AWAITING_EXTERNAL");
  }
  if (target === "AWAITING_STAFF") {
    await moveThread(fixture, "IN_PROGRESS");
    await moveThread(fixture, "AWAITING_EXTERNAL");
    return moveThread(fixture, "AWAITING_STAFF");
  }
  if (target === "COMPLETED" || target === "EXPIRED") {
    return moveThread(fixture, target);
  }
  await moveThread(fixture, "EXPIRED");
  return moveThread(fixture, "DISPOSED");
}

function postReply(
  fixture: ReturnType<typeof createExternalDemoFixture>,
  cookie: string,
  fields: Readonly<Record<string, string>>,
  requestOrigin = IN_MEMORY_ORIGIN,
): Promise<Response> | Response {
  return postForm(
    fixture.app,
    `${EXTERNAL_RETRIEVAL_ROUTE_PREFIX}/reply`,
    fields,
    { cookie, requestOrigin },
  );
}

describe("external reply development security", () => {
  it("rejects cross-origin submission before reply mutation", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
    const { cookie } = await establishCapability(fixture, grant);
    const before = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    const response = await postReply(
      fixture,
      cookie ?? "",
      { messageBody: "Cross-origin synthetic reply" },
      "https://different.example",
    );
    expect(response.status).toBe(403);
    expect(
      await fixture.runtime.store.listMessages(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toHaveLength(before.length);
  });

  it("ignores browser-supplied actor and identifier fields", async () => {
    const fixture = createExternalDemoFixture();
    const { threadId } = await createSyntheticThread(fixture);
    const initial = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    const authoritativeActor = initial[0]?.actorRef;
    const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
    const { cookie } = await establishCapability(fixture, grant);
    const response = await postReply(fixture, cookie ?? "", {
      messageBody: "Synthetic authoritative actor check.",
      actorRef: "browser-selected-actor",
      actorKind: "STAFF",
      messageId: "browser-selected-message",
      auditEventId: "browser-selected-audit",
    });
    expect(response.status).toBe(303);
    const messages = await fixture.runtime.store.listMessages(
      fixture.runtime.deploymentId,
      threadId,
    );
    expect(messages.at(-1)?.actorRef).toBe(authoritativeActor);
    expect(messages.at(-1)?.actorRef).not.toBe("browser-selected-actor");

    const events = fixture.runtime.store.listAuditEvents(
      fixture.runtime.deploymentId,
      threadId,
    );
    const latestReplyAudit = events
      .filter((event) => event.eventType === "MESSAGE_APPENDED")
      .at(-1);
    expect(latestReplyAudit).toMatchObject({
      actorRef: authoritativeActor,
      actorKind: "EXTERNAL",
      accessGrantId: grant.grantId,
      outcome: "SUCCEEDED",
    });
    expect(JSON.stringify(latestReplyAudit)).not.toContain(
      "Synthetic authoritative actor check.",
    );
    expect(JSON.stringify(events)).not.toContain(grant.secret);
    expect(events.some((event) => event.eventType === "THREAD_OPENED")).toBe(
      false,
    );
    expect(
      events.some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(
      await fixture.runtime.store.listTransferAttestations(
        fixture.runtime.deploymentId,
        threadId,
      ),
    ).toEqual([]);
  });

  it("denies revoked and expired grants after capability establishment", async () => {
    for (const mode of ["revoked", "expired"] as const) {
      const fixture = createExternalDemoFixture();
      const { threadId } = await createSyntheticThread(fixture);
      const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"], 2);
      const { cookie } = await establishCapability(fixture, grant);
      if (mode === "revoked") {
        await fixture.runtime.accessGrantService.revokeAccessGrant({
          actor: fixture.runtime.staffActor,
          deploymentId: fixture.runtime.deploymentId,
          threadId,
          grantId: grant.grantId,
          expectedVersion: 1,
        });
      } else {
        fixture.advanceSeconds(3);
      }
      const before = await fixture.runtime.store.listMessages(
        fixture.runtime.deploymentId,
        threadId,
      );
      const response = await postReply(fixture, cookie ?? "", {
        messageBody: `${mode} reply is denied`,
      });
      expect(response.status).toBe(403);
      expect(
        await fixture.runtime.store.listMessages(
          fixture.runtime.deploymentId,
          threadId,
        ),
      ).toHaveLength(before.length);
    }
  });

  it("allows every approved active reply lifecycle without transitioning it", async () => {
    for (const state of [
      "NEW",
      "IN_PROGRESS",
      "AWAITING_EXTERNAL",
      "AWAITING_STAFF",
    ] as const) {
      const fixture = createExternalDemoFixture();
      const { threadId } = await createSyntheticThread(fixture);
      await moveFromNew(fixture, state);
      const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
      const { cookie } = await establishCapability(fixture, grant);
      const response = await postReply(fixture, cookie ?? "", {
        messageBody: `Synthetic reply in ${state}`,
      });
      expect(response.status).toBe(303);
      const current = await fixture.runtime.store.getThread(
        fixture.runtime.deploymentId,
        threadId,
      );
      expect(current?.state).toBe(state);
      expect(current?.lastActivityAt).toBe(fixture.runtime.now());
      expect(current?.attentionAt).toBe(fixture.runtime.now());
    }
  });

  it("denies reply after lifecycle becomes completed, expired, or disposed", async () => {
    for (const state of ["COMPLETED", "EXPIRED", "DISPOSED"] as const) {
      const fixture = createExternalDemoFixture();
      const { threadId } = await createSyntheticThread(fixture);
      const grant = await issueGrant(fixture, threadId, ["THREAD_REPLY"]);
      const { cookie } = await establishCapability(fixture, grant);
      await moveFromNew(fixture, state);
      const before = await fixture.runtime.store.listMessages(
        fixture.runtime.deploymentId,
        threadId,
      );
      const response = await postReply(fixture, cookie ?? "", {
        messageBody: `Synthetic denied reply in ${state}`,
      });
      expect(response.status).toBe(403);
      expect(
        await fixture.runtime.store.listMessages(
          fixture.runtime.deploymentId,
          threadId,
        ),
      ).toHaveLength(before.length);
    }
  });
});
