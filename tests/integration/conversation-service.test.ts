import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../src/application/errors.js";
import { ConversationService } from "../../src/application/conversation-service.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import type {
  ActorAuthorization,
  AuditEvent,
  Message,
  Queue,
  Thread,
} from "../../src/domain/index.js";
import {
  ALL_WORKFLOW_PERMISSIONS,
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  EXTERNAL_A,
  QUEUE_A,
  QUEUE_B,
  ROUTING_GENERAL,
  ROUTING_RECORDS,
  STAFF_A,
  THREAD_A,
  THREAD_B,
  actorContext,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

function makeConversationStore(
  options: {
    readonly queues?: readonly Queue[];
    readonly threads?: readonly Thread[];
    readonly messages?: readonly Message[];
    readonly actors?: readonly ActorAuthorization[];
    readonly auditEvents?: readonly AuditEvent[];
  } = {},
): InMemoryWorkflowStore {
  return new InMemoryWorkflowStore({
    queues: options.queues ?? [makeQueue()],
    threads: options.threads ?? [makeThread()],
    messages: options.messages ?? [],
    actorAuthorizations: options.actors ?? [makeActorAuthorization()],
    ...(options.auditEvents === undefined
      ? {}
      : { auditEvents: options.auditEvents }),
  });
}

function initiationInput(
  overrides: Partial<
    Parameters<ConversationService["initiateExternalExchange"]>[0]
  > = {},
): Parameters<ConversationService["initiateExternalExchange"]>[0] {
  return {
    deploymentId: DEPLOYMENT_A,
    queueId: QUEUE_A,
    routingCategory: ROUTING_GENERAL,
    threadId: "thread-created",
    externalParticipantRef: EXTERNAL_A,
    messageId: "message-created",
    initialMessage: "Synthetic initial secure exchange message.",
    threadCreatedAuditEventId: "audit-thread-created",
    messageAuditEventId: "audit-message-created",
    at: "2026-08-12T14:00:00.000Z",
    ...overrides,
  };
}

async function expectApplicationError(
  promise: Promise<unknown>,
  code: ApplicationError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected application error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe(code);
  }
}

describe("conversation service", () => {
  it("creates an external exchange with NEW thread, initial message, and minimized audits atomically", async () => {
    const store = makeConversationStore({ threads: [] });
    const service = new ConversationService(store);

    const result = await service.initiateExternalExchange(initiationInput());

    expect(result.thread).toMatchObject({
      deploymentId: DEPLOYMENT_A,
      queueId: QUEUE_A,
      routingCategory: ROUTING_GENERAL,
      state: "NEW",
      version: 1,
      lastActivityAt: "2026-08-12T14:00:00.000Z",
      attentionAt: "2026-08-12T14:00:00.000Z",
    });
    expect(result.message).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      actorRef: EXTERNAL_A,
      body: {
        kind: "PLAIN_TEXT",
        text: "Synthetic initial secure exchange message.",
      },
    });
    expect(
      await store.getActorAuthorization(DEPLOYMENT_A, EXTERNAL_A),
    ).toBeUndefined();
    expect(
      (await store.listMessages(DEPLOYMENT_A, "thread-created")).map(
        (message) => message.messageId,
      ),
    ).toEqual(["message-created"]);
    expect(store.listAuditEvents(DEPLOYMENT_A, "thread-created")).toEqual([
      expect.objectContaining({
        eventType: "THREAD_CREATED",
        actorKind: "EXTERNAL",
      }),
      expect.objectContaining({
        eventType: "MESSAGE_APPENDED",
        actorKind: "EXTERNAL",
        messageId: "message-created",
      }),
    ]);
  });

  it("rejects external routing to an inactive queue", async () => {
    const store = makeConversationStore({
      queues: [makeQueue({ active: false })],
      threads: [],
    });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.initiateExternalExchange(initiationInput()),
      "ROUTING_NOT_AVAILABLE",
    );
    expect(
      await store.getThread(DEPLOYMENT_A, "thread-created"),
    ).toBeUndefined();
  });

  it("rejects an unsupported routing category", async () => {
    const store = makeConversationStore({ threads: [] });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.initiateExternalExchange(
        initiationInput({ routingCategory: "UNSUPPORTED" }),
      ),
      "ROUTING_NOT_AVAILABLE",
    );
  });

  it("rejects cross-deployment external queue routing without exposing the other queue", async () => {
    const store = makeConversationStore({
      queues: [
        makeQueue({
          deploymentId: DEPLOYMENT_B,
          queueId: QUEUE_B,
          displayLabel: "Synthetic Other Deployment Queue",
        }),
      ],
      threads: [],
    });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.initiateExternalExchange(initiationInput({ queueId: QUEUE_B })),
      "ROUTING_NOT_AVAILABLE",
    );
  });

  it("rolls back thread, message, and audit creation on an injected transaction failure", async () => {
    const store = makeConversationStore({ threads: [] });
    const service = new ConversationService(store);
    store.failNextCommit();

    await expect(
      service.initiateExternalExchange(initiationInput()),
    ).rejects.toThrow("Synthetic transaction failure");

    expect(
      await store.getThread(DEPLOYMENT_A, "thread-created"),
    ).toBeUndefined();
    expect(await store.listMessages(DEPLOYMENT_A, "thread-created")).toEqual(
      [],
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, "thread-created")).toEqual([]);
  });

  it("returns immutable messages in chronological order only after authorized open", async () => {
    const messages = [
      makeMessage({
        messageId: "message-late",
        createdAt: "2026-08-12T14:03:00.000Z",
      }),
      makeMessage({
        messageId: "message-early-b",
        createdAt: "2026-08-12T14:01:00.000Z",
      }),
      makeMessage({
        messageId: "message-early-a",
        createdAt: "2026-08-12T14:01:00.000Z",
      }),
    ];
    const store = makeConversationStore({ messages });
    const service = new ConversationService(store);

    const result = await service.openStaffConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-open-chronological",
      at: "2026-08-12T14:04:00.000Z",
    });

    expect(result.messages.map((message) => message.messageId)).toEqual([
      "message-early-a",
      "message-early-b",
      "message-late",
    ]);
  });

  it("lists only authorized queue candidates with bounded work-list metadata", async () => {
    const otherThread = makeThread({
      threadId: THREAD_B,
      queueId: QUEUE_B,
      routingCategory: ROUTING_RECORDS,
      updatedAt: "2026-08-12T14:05:00.000Z",
      lastActivityAt: "2026-08-12T14:05:00.000Z",
    });
    const store = makeConversationStore({
      queues: [makeQueue(), makeQueue({ queueId: QUEUE_B })],
      threads: [makeThread(), otherThread],
      messages: [
        makeMessage({
          body: {
            kind: "PLAIN_TEXT",
            text: "Synthetic sensitive body must not appear in candidate.",
          },
        }),
      ],
    });
    const service = new ConversationService(store);

    const candidates = await service.listQueueCandidates({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      queueId: QUEUE_A,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        threadId: THREAD_A,
        queueId: QUEUE_A,
        routingCategory: ROUTING_GENERAL,
      }),
    );
    expect(candidates[0]).not.toHaveProperty("body");
    expect(candidates[0]).not.toHaveProperty("messages");
    expect(JSON.stringify(candidates[0])).not.toContain(
      "Synthetic sensitive body",
    );
  });

  it("rejects queue listing outside current actor queue scope", async () => {
    const store = makeConversationStore({
      queues: [makeQueue(), makeQueue({ queueId: QUEUE_B })],
    });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.listQueueCandidates({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        queueId: QUEUE_B,
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("does not treat a queue candidate as authoritative thread-read permission", async () => {
    const actor = makeActorAuthorization({ permissions: ["QUEUE_LIST"] });
    const store = makeConversationStore({ actors: [actor] });
    const service = new ConversationService(store);

    const candidates = await service.listQueueCandidates({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      queueId: QUEUE_A,
    });
    expect(candidates.map((candidate) => candidate.threadId)).toContain(
      THREAD_A,
    );

    await expectApplicationError(
      service.openStaffConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-open-denied",
        at: "2026-08-12T14:10:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("opens an authorized conversation and records distinct Opened evidence", async () => {
    const store = makeConversationStore({ messages: [makeMessage()] });
    const service = new ConversationService(store);

    const result = await service.openStaffConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-open",
      at: "2026-08-12T14:10:00.000Z",
    });

    expect(result.thread.threadId).toBe(THREAD_A);
    expect(result.messages).toHaveLength(1);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({
        eventId: "audit-open",
        eventType: "THREAD_OPENED",
      }),
    ]);
  });

  it("denies authoritative conversation read when actor lacks thread queue scope", async () => {
    const store = makeConversationStore({
      actors: [makeActorAuthorization({ allowedQueueIds: [QUEUE_B] })],
    });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.openStaffConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-open-denied",
        at: "2026-08-12T14:10:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("denies cross-deployment conversation access", async () => {
    const store = makeConversationStore();
    const service = new ConversationService(store);

    await expectApplicationError(
      service.openStaffConversation({
        actor: actorContext({ deploymentId: DEPLOYMENT_B }),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-open-cross-deployment",
        at: "2026-08-12T14:10:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("keeps Opened distinct from Downloaded, TransferAttestation, and completion", async () => {
    const store = makeConversationStore({ messages: [makeMessage()] });
    const service = new ConversationService(store);

    await service.openStaffConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-open-only",
      at: "2026-08-12T14:10:00.000Z",
    });

    const events = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    expect(events.map((event) => event.eventType)).toEqual(["THREAD_OPENED"]);
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      state: "IN_PROGRESS",
      version: 3,
    });
  });

  it("appends an authorized staff reply with audit and activity metadata but no lifecycle inference", async () => {
    const store = makeConversationStore({ messages: [makeMessage()] });
    const service = new ConversationService(store);

    const result = await service.replyToConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      expectedVersion: 3,
      messageId: "message-staff-reply",
      messageBody: "Synthetic staff reply.",
      auditEventId: "audit-staff-reply",
      at: "2026-08-12T14:20:00.000Z",
    });

    expect(result.message).toMatchObject({
      direction: "STAFF_TO_EXTERNAL",
      actorRef: STAFF_A,
      body: { kind: "PLAIN_TEXT", text: "Synthetic staff reply." },
    });
    expect(result.thread).toMatchObject({
      state: "IN_PROGRESS",
      version: 4,
      updatedAt: "2026-08-12T14:20:00.000Z",
      lastActivityAt: "2026-08-12T14:20:00.000Z",
    });
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({
        eventType: "MESSAGE_APPENDED",
        messageId: "message-staff-reply",
      }),
    ]);
  });

  it("denies staff reply without explicit THREAD_REPLY permission", async () => {
    const store = makeConversationStore({
      actors: [
        makeActorAuthorization({
          permissions: ALL_WORKFLOW_PERMISSIONS.filter(
            (permission) => permission !== "THREAD_REPLY",
          ),
        }),
      ],
    });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.replyToConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        expectedVersion: 3,
        messageId: "message-denied",
        messageBody: "Synthetic denied reply.",
        auditEventId: "audit-denied",
        at: "2026-08-12T14:20:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("requires a STAFF actor for staff reply even when an administrator has the action permission", async () => {
    const admin = makeActorAuthorization({
      actorRef: "admin-a",
      actorKind: "ADMIN",
    });
    const store = makeConversationStore({ actors: [admin] });
    const service = new ConversationService(store);

    await expectApplicationError(
      service.replyToConversation({
        actor: actorContext({ actorRef: "admin-a", actorKind: "ADMIN" }),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        expectedVersion: 3,
        messageId: "message-admin-denied",
        messageBody: "Synthetic administrator reply.",
        auditEventId: "audit-admin-denied",
        at: "2026-08-12T14:20:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("rolls back reply message, audit, and thread activity together on transaction failure", async () => {
    const original = makeMessage();
    const store = makeConversationStore({ messages: [original] });
    const service = new ConversationService(store);
    store.failNextCommit();

    await expect(
      service.replyToConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        expectedVersion: 3,
        messageId: "message-rollback",
        messageBody: "Synthetic rollback reply.",
        auditEventId: "audit-rollback",
        at: "2026-08-12T14:20:00.000Z",
      }),
    ).rejects.toThrow("Synthetic transaction failure");

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      version: 3,
      lastActivityAt: "2026-08-12T12:00:00.000Z",
    });
    expect(
      (await store.listMessages(DEPLOYMENT_A, THREAD_A)).map(
        (message) => message.messageId,
      ),
    ).toEqual(["message-1"]);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("never copies staff reply message body into audit evidence", async () => {
    const store = makeConversationStore();
    const service = new ConversationService(store);
    const sensitiveSyntheticText =
      "Synthetic confidential body that must remain message content only.";

    await service.replyToConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      expectedVersion: 3,
      messageId: "message-private",
      messageBody: sensitiveSyntheticText,
      auditEventId: "audit-private",
      at: "2026-08-12T14:20:00.000Z",
    });

    const event = store.listAuditEvents(DEPLOYMENT_A, THREAD_A)[0];
    expect(event).toMatchObject({
      eventType: "MESSAGE_APPENDED",
      messageId: "message-private",
    });
    expect(JSON.stringify(event)).not.toContain(sensitiveSyntheticText);
  });

  it("does not infer completion, download, or TransferAttestation from a staff reply", async () => {
    const store = makeConversationStore();
    const service = new ConversationService(store);

    await service.replyToConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      expectedVersion: 3,
      messageId: "message-no-inference",
      messageBody: "Synthetic reply with no lifecycle inference.",
      auditEventId: "audit-no-inference",
      at: "2026-08-12T14:20:00.000Z",
    });

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      state: "IN_PROGRESS",
    });
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
  });

  it("rejects stale reply activity updates before any message or audit is committed", async () => {
    const store = makeConversationStore();
    const service = new ConversationService(store);

    await expect(
      service.replyToConversation({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        expectedVersion: 2,
        messageId: "message-stale",
        messageBody: "Synthetic stale reply.",
        auditEventId: "audit-stale",
        at: "2026-08-12T14:20:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });

    expect(await store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual([]);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("preserves attention metadata on open and staff reply instead of inventing per-user unread state", async () => {
    const thread = makeThread({
      attentionAt: "2026-08-12T12:30:00.000Z",
    });
    const store = makeConversationStore({ threads: [thread] });
    const service = new ConversationService(store);

    await service.openStaffConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-attention-open",
      at: "2026-08-12T14:00:00.000Z",
    });
    const reply = await service.replyToConversation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      expectedVersion: 3,
      messageId: "message-attention-reply",
      messageBody: "Synthetic attention-neutral reply.",
      auditEventId: "audit-attention-reply",
      at: "2026-08-12T14:05:00.000Z",
    });

    expect(reply.thread.attentionAt).toBe("2026-08-12T12:30:00.000Z");
  });
});
