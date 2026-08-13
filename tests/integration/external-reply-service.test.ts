import { describe, expect, it } from "vitest";

import {
  AccessGrantService,
  type ReplyExternalConversationInput,
} from "../../src/application/access-grant-service.js";
import type { Clock } from "../../src/application/clock.js";
import { ApplicationError } from "../../src/application/errors.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import type {
  WorkflowMutation,
  WorkflowStore,
} from "../../src/application/ports.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";
import { DomainError } from "../../src/domain/errors.js";
import { MAX_MESSAGE_BODY_LENGTH } from "../../src/domain/message.js";
import {
  recordThreadActivity,
  transitionThread,
  type ThreadLifecycleState,
} from "../../src/domain/thread.js";
import {
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  EXTERNAL_A,
  STAFF_A,
  THREAD_A,
  actorContext,
  makeAccessGrantPolicy,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

class SequenceIdGenerator implements OpaqueIdGenerator {
  private readonly counters = new Map<OpaqueIdPurpose, number>();

  generate(purpose: OpaqueIdPurpose): string {
    const next = (this.counters.get(purpose) ?? 0) + 1;
    this.counters.set(purpose, next);
    return `${purpose}-generated-${next}`;
  }
}

class MutableClock implements Clock {
  constructor(private value: string) {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

interface Fixture {
  readonly store: InMemoryWorkflowStore;
  readonly service: AccessGrantService;
  readonly clock: MutableClock;
}

function createService(
  store: WorkflowStore,
  clock: MutableClock,
): AccessGrantService {
  return new AccessGrantService(
    store,
    new SequenceIdGenerator(),
    new WebCryptoAccessGrantSecretManager(),
    clock,
  );
}

function fixture(
  options: {
    readonly threadState?: ThreadLifecycleState;
    readonly allowedOperations?: readonly (
      | "THREAD_READ"
      | "ATTACHMENT_READ"
      | "THREAD_REPLY"
    )[];
  } = {},
): Fixture {
  const clock = new MutableClock("2026-08-13T04:00:00.000Z");
  const store = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [makeThread({ state: options.threadState ?? "IN_PROGRESS" })],
    messages: [
      makeMessage({
        messageId: "seed-external-message",
        actorRef: EXTERNAL_A,
        createdAt: "2026-08-13T03:50:00.000Z",
      }),
      makeMessage({
        messageId: "seed-staff-message",
        direction: "STAFF_TO_EXTERNAL",
        actorRef: STAFF_A,
        createdAt: "2026-08-13T03:55:00.000Z",
        body: { kind: "PLAIN_TEXT", text: "Synthetic staff response." },
      }),
    ],
    accessGrantPolicies: [
      makeAccessGrantPolicy({
        allowedOperations: options.allowedOperations ?? [
          "THREAD_READ",
          "ATTACHMENT_READ",
          "THREAD_REPLY",
        ],
      }),
    ],
    completionPolicies: [],
    actorAuthorizations: [makeActorAuthorization()],
  });

  return {
    store,
    service: createService(store, clock),
    clock,
  };
}

async function issue(
  service: AccessGrantService,
  requestedOperations: readonly (
    | "THREAD_READ"
    | "ATTACHMENT_READ"
    | "THREAD_REPLY"
  )[] = ["THREAD_REPLY"],
) {
  return service.issueAccessGrant({
    actor: actorContext(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    requestedOperations,
    requestedLifetimeSeconds: 600,
  });
}

function replyInput(
  grant: Awaited<ReturnType<typeof issue>>,
  overrides: Partial<ReplyExternalConversationInput> = {},
): ReplyExternalConversationInput {
  return {
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    grantId: grant.grantId,
    secret: grant.secret,
    messageBody: "Synthetic external follow-up.",
    ...overrides,
  };
}

async function expectApplicationCode(
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

async function expectDomainCode(
  promise: Promise<unknown>,
  code: DomainError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected domain error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

async function moveThread(
  store: InMemoryWorkflowStore,
  targetState: ThreadLifecycleState,
  at: string,
): Promise<void> {
  const current = await store.getThread(DEPLOYMENT_A, THREAD_A);
  if (current === undefined) {
    throw new Error("Synthetic authoritative thread is missing.");
  }
  await store.commit({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    expectedThreadVersion: current.version,
    nextThread: transitionThread(current, targetState, current.version, { at }),
  });
}

function staleCommitStore(inner: InMemoryWorkflowStore): {
  readonly store: WorkflowStore;
  arm(): void;
} {
  let armed = false;
  const store: WorkflowStore = {
    getQueue(deploymentId, queueId) {
      return inner.getQueue(deploymentId, queueId);
    },
    getThread(deploymentId, threadId) {
      return inner.getThread(deploymentId, threadId);
    },
    listThreadsForQueue(deploymentId, queueId) {
      return inner.listThreadsForQueue(deploymentId, queueId);
    },
    listMessages(deploymentId, threadId) {
      return inner.listMessages(deploymentId, threadId);
    },
    getMessage(deploymentId, threadId, messageId) {
      return inner.getMessage(deploymentId, threadId, messageId);
    },
    getAttachment(deploymentId, attachmentId) {
      return inner.getAttachment(deploymentId, attachmentId);
    },
    listAttachmentsForMessage(deploymentId, threadId, messageId) {
      return inner.listAttachmentsForMessage(deploymentId, threadId, messageId);
    },
    getCurrentAttachmentFilePolicy(deploymentId) {
      return inner.getCurrentAttachmentFilePolicy(deploymentId);
    },
    getAccessGrant(deploymentId, accessGrantId) {
      return inner.getAccessGrant(deploymentId, accessGrantId);
    },
    getCurrentAccessGrantPolicy(deploymentId) {
      return inner.getCurrentAccessGrantPolicy(deploymentId);
    },
    getCurrentCompletionPolicy(deploymentId) {
      return inner.getCurrentCompletionPolicy(deploymentId);
    },
    getActorAuthorization(deploymentId, actorRef) {
      return inner.getActorAuthorization(deploymentId, actorRef);
    },
    listTransferAttestations(deploymentId, threadId) {
      return inner.listTransferAttestations(deploymentId, threadId);
    },
    listTransferAttestationControls(deploymentId, threadId) {
      return inner.listTransferAttestationControls(deploymentId, threadId);
    },
    async commit(mutation: WorkflowMutation): Promise<void> {
      if (armed && (mutation.messages?.length ?? 0) > 0) {
        armed = false;
        const current = await inner.getThread(
          mutation.deploymentId,
          mutation.threadId,
        );
        if (current === undefined) {
          throw new Error("Synthetic authoritative thread is missing.");
        }
        await inner.commit({
          deploymentId: mutation.deploymentId,
          threadId: mutation.threadId,
          expectedThreadVersion: current.version,
          nextThread: recordThreadActivity(
            current,
            current.version,
            "2026-08-13T04:00:30.000Z",
          ),
        });
      }
      await inner.commit(mutation);
    },
  };

  return {
    store,
    arm() {
      armed = true;
    },
  };
}

describe("AccessGrant external reply core", () => {
  it("issues explicit reply-only authority without silently granting read or attachment authority", async () => {
    const { service } = fixture();
    const grant = await issue(service, ["THREAD_REPLY"]);

    expect(grant.permittedOperations).toEqual(["THREAD_REPLY"]);
    await expectApplicationCode(
      service.validatePresentedAccessGrant({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
        operation: "THREAD_READ",
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    await expectApplicationCode(
      service.validatePresentedAccessGrant({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
        operation: "ATTACHMENT_READ",
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    await expect(
      service.replyExternalConversation(replyInput(grant)),
    ).resolves.toMatchObject({ threadId: THREAD_A });
  });

  it("keeps existing read-only grants from silently gaining reply authority", async () => {
    const { service } = fixture();
    const grant = await issue(service, ["THREAD_READ"]);

    await expectApplicationCode(
      service.replyExternalConversation(replyInput(grant)),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("supports mixed read/reply authority with each operation checked independently", async () => {
    const { service } = fixture();
    const grant = await issue(service, ["THREAD_READ", "THREAD_REPLY"]);

    await expect(
      service.replyExternalConversation(replyInput(grant)),
    ).resolves.toBeDefined();
    const conversation = await service.retrieveExternalConversation({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: grant.grantId,
      secret: grant.secret,
    });
    expect(conversation.messages.at(-1)).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      body: { kind: "PLAIN_TEXT", text: "Synthetic external follow-up." },
    });
  });

  it("supports mixed attachment/reply authority without granting conversation read", async () => {
    const { service } = fixture();
    const grant = await issue(service, ["ATTACHMENT_READ", "THREAD_REPLY"]);

    await expect(
      service.validatePresentedAccessGrant({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
        operation: "ATTACHMENT_READ",
      }),
    ).resolves.toMatchObject({ operation: "ATTACHMENT_READ" });
    await expect(
      service.replyExternalConversation(replyInput(grant)),
    ).resolves.toBeDefined();
    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("rejects reply issuance when current policy does not permit THREAD_REPLY", async () => {
    const { service } = fixture({
      allowedOperations: ["THREAD_READ", "ATTACHMENT_READ"],
    });

    await expectApplicationCode(
      issue(service, ["THREAD_REPLY"]),
      "ACCESS_GRANT_POLICY_REJECTED",
    );
  });

  it("rejects issuance containing reply authority when the current thread is not reply eligible", async () => {
    const { service } = fixture({ threadState: "COMPLETED" });

    await expectApplicationCode(
      issue(service, ["THREAD_READ", "THREAD_REPLY"]),
      "ACCESS_GRANT_POLICY_REJECTED",
    );
  });

  it("denies wrong secret, grant ID without secret proof, wrong deployment, and wrong thread conservatively", async () => {
    const { service } = fixture();
    const grant = await issue(service);

    for (const input of [
      replyInput(grant, { secret: "wrong" }),
      replyInput(grant, { secret: "" }),
      replyInput(grant, { deploymentId: DEPLOYMENT_B }),
      replyInput(grant, { threadId: "thread-other" }),
    ]) {
      await expectApplicationCode(
        service.replyExternalConversation(input),
        "EXTERNAL_ACCESS_DENIED",
      );
    }
  });

  it("denies a revoked grant", async () => {
    const { service } = fixture();
    const grant = await issue(service);
    await service.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: grant.grantId,
      expectedVersion: 1,
    });

    await expectApplicationCode(
      service.replyExternalConversation(replyInput(grant)),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("denies an expired grant using authoritative server time", async () => {
    const { service, clock } = fixture();
    const grant = await issue(service);
    clock.set("2026-08-13T04:10:00.000Z");

    await expectApplicationCode(
      service.replyExternalConversation(replyInput(grant)),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("derives the external actor only from the authoritative grant", async () => {
    const { store, service } = fixture();
    const grant = await issue(service);
    const forgedInput = {
      ...replyInput(grant),
      externalParticipantRef: "attacker-selected-actor",
      actorKind: "STAFF",
      auditActorIdentity: "attacker-selected-audit-actor",
    } as ReplyExternalConversationInput & {
      readonly externalParticipantRef: string;
      readonly actorKind: string;
      readonly auditActorIdentity: string;
    };

    await service.replyExternalConversation(forgedInput);
    const messages = await store.listMessages(DEPLOYMENT_A, THREAD_A);
    const reply = messages.at(-1);
    expect(reply).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      actorRef: EXTERNAL_A,
    });
    expect(reply?.actorRef).not.toBe("attacker-selected-actor");
  });

  it("allows replies in every approved active conversational state", async () => {
    for (const state of [
      "NEW",
      "IN_PROGRESS",
      "AWAITING_EXTERNAL",
      "AWAITING_STAFF",
    ] as const) {
      const { store, service } = fixture({ threadState: state });
      const grant = await issue(service);
      await service.replyExternalConversation(replyInput(grant));
      expect((await store.getThread(DEPLOYMENT_A, THREAD_A))?.state).toBe(state);
    }
  });

  it("revalidates current state and denies a previously issued reply grant after completion", async () => {
    const { service, store } = fixture();
    const grant = await issue(service, ["THREAD_READ", "THREAD_REPLY"]);
    await moveThread(store, "COMPLETED", "2026-08-13T04:01:00.000Z");

    await expect(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: grant.grantId,
        secret: grant.secret,
      }),
    ).resolves.toBeDefined();
    await expectApplicationCode(
      service.replyExternalConversation(replyInput(grant)),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("denies previously issued reply authority after expiration or disposition of the thread", async () => {
    const expired = fixture();
    const expiredGrant = await issue(expired.service);
    await moveThread(
      expired.store,
      "EXPIRED",
      "2026-08-13T04:01:00.000Z",
    );
    await expectApplicationCode(
      expired.service.replyExternalConversation(replyInput(expiredGrant)),
      "EXTERNAL_ACCESS_DENIED",
    );

    const disposed = fixture();
    const disposedGrant = await issue(disposed.service);
    await moveThread(
      disposed.store,
      "COMPLETED",
      "2026-08-13T04:01:00.000Z",
    );
    await moveThread(
      disposed.store,
      "DISPOSED",
      "2026-08-13T04:02:00.000Z",
    );
    await expectApplicationCode(
      disposed.service.replyExternalConversation(replyInput(disposedGrant)),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("reuses bounded plain-text message validation", async () => {
    for (const invalidBody of [
      "",
      "   ",
      `invalid\u0000control`,
      "x".repeat(MAX_MESSAGE_BODY_LENGTH + 1),
    ]) {
      const { service } = fixture();
      const grant = await issue(service);
      await expectDomainCode(
        service.replyExternalConversation(
          replyInput(grant, { messageBody: invalidBody }),
        ),
        "INVALID_MESSAGE_BODY",
      );
    }
  });

  it("atomically appends one external message, activity/attention, and minimized audit without lifecycle transition", async () => {
    const { store, service, clock } = fixture({
      threadState: "AWAITING_EXTERNAL",
    });
    const grant = await issue(service);
    const storedGrant = await store.getAccessGrant(DEPLOYMENT_A, grant.grantId);
    clock.set("2026-08-13T04:03:00.000Z");

    await service.replyExternalConversation(
      replyInput(grant, { messageBody: "Line one.\r\nLine two." }),
    );

    const thread = await store.getThread(DEPLOYMENT_A, THREAD_A);
    expect(thread).toMatchObject({
      state: "AWAITING_EXTERNAL",
      version: 4,
      updatedAt: "2026-08-13T04:03:00.000Z",
      lastActivityAt: "2026-08-13T04:03:00.000Z",
      attentionAt: "2026-08-13T04:03:00.000Z",
    });

    const messages = await store.listMessages(DEPLOYMENT_A, THREAD_A);
    const reply = messages.at(-1);
    expect(reply).toMatchObject({
      direction: "EXTERNAL_TO_STAFF",
      actorRef: EXTERNAL_A,
      createdAt: "2026-08-13T04:03:00.000Z",
      body: { kind: "PLAIN_TEXT", text: "Line one.\nLine two." },
    });

    const audit = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    const appended = audit.filter((event) => event.eventType === "MESSAGE_APPENDED");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      actorRef: EXTERNAL_A,
      actorKind: "EXTERNAL",
      accessGrantId: grant.grantId,
      messageId: reply?.messageId,
      at: "2026-08-13T04:03:00.000Z",
      outcome: "SUCCEEDED",
    });

    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain("Line one");
    expect(serializedAudit).not.toContain(grant.secret);
    expect(serializedAudit).not.toContain(storedGrant?.verifierDigest ?? "never");
    expect(audit.some((event) => event.eventType === "THREAD_OPENED")).toBe(false);
    expect(
      audit.some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(audit.some((event) => event.eventType === "THREAD_COMPLETED")).toBe(
      false,
    );
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
  });

  it("rolls back message activity and audit when the atomic commit fails", async () => {
    const { store, service } = fixture();
    const grant = await issue(service);
    const beforeThread = await store.getThread(DEPLOYMENT_A, THREAD_A);
    const beforeMessages = await store.listMessages(DEPLOYMENT_A, THREAD_A);
    const beforeAudit = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    store.failNextCommit();

    await expect(
      service.replyExternalConversation(replyInput(grant)),
    ).rejects.toThrow("Synthetic transaction failure");
    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(beforeThread);
    expect(await store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeMessages,
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(beforeAudit);
  });

  it("fails a stale concurrent reply without partially appending message or audit", async () => {
    const inner = fixture();
    const guarded = staleCommitStore(inner.store);
    const service = createService(guarded.store, inner.clock);
    const grant = await issue(service);
    const beforeMessages = await inner.store.listMessages(
      DEPLOYMENT_A,
      THREAD_A,
    );
    const beforeAudit = inner.store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    guarded.arm();

    await expectApplicationCode(
      service.replyExternalConversation(replyInput(grant)),
      "EXTERNAL_ACCESS_DENIED",
    );

    expect(await inner.store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeMessages,
    );
    expect(inner.store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeAudit,
    );
    expect(await inner.store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      version: 4,
      lastActivityAt: "2026-08-13T04:00:30.000Z",
    });
  });
});
