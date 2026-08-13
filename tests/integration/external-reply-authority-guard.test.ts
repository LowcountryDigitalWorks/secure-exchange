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
import {
  InMemoryWorkflowStore,
  type InMemoryWorkflowSeed,
} from "../../src/adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";
import { revokeAccessGrant as revokeAccessGrantRecord } from "../../src/domain/access-grant.js";
import {
  DEPLOYMENT_A,
  EXTERNAL_A,
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
    return `${purpose}-guard-${next}`;
  }
}

class MutableClock implements Clock {
  constructor(private value: string) {}

  now(): string {
    return this.value;
  }
}

class SequenceClock implements Clock {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  now(): string {
    const value = this.values[Math.min(this.index, this.values.length - 1)];
    if (value === undefined) {
      throw new Error("Synthetic sequence clock requires at least one value.");
    }
    this.index += 1;
    return value;
  }
}

class RevocationRaceStore extends InMemoryWorkflowStore {
  private armedGrantId?: string;
  private armedRevokedAt?: string;

  armRevocation(grantId: string, revokedAt: string): void {
    this.armedGrantId = grantId;
    this.armedRevokedAt = revokedAt;
  }

  override async commit(mutation: WorkflowMutation): Promise<void> {
    if (
      this.armedGrantId !== undefined &&
      this.armedRevokedAt !== undefined &&
      (mutation.messages?.length ?? 0) > 0
    ) {
      const grantId = this.armedGrantId;
      const revokedAt = this.armedRevokedAt;
      this.armedGrantId = undefined;
      this.armedRevokedAt = undefined;
      const current = await this.getAccessGrant(mutation.deploymentId, grantId);
      if (current === undefined || current.threadId !== mutation.threadId) {
        throw new Error("Synthetic authoritative AccessGrant is missing.");
      }
      const revoked = revokeAccessGrantRecord(
        current,
        current.version,
        revokedAt,
      );
      await super.commit({
        deploymentId: mutation.deploymentId,
        threadId: mutation.threadId,
        accessGrantUpdates: [
          {
            expectedVersion: current.version,
            accessGrant: revoked,
          },
        ],
      });
    }
    await super.commit(mutation);
  }
}

function seed(): InMemoryWorkflowSeed {
  return {
    queues: [makeQueue()],
    threads: [makeThread()],
    messages: [
      makeMessage({
        messageId: "guard-seed-external-message",
        actorRef: EXTERNAL_A,
        createdAt: "2026-08-13T03:50:00.000Z",
      }),
    ],
    accessGrantPolicies: [
      makeAccessGrantPolicy({
        allowedOperations: ["THREAD_READ", "ATTACHMENT_READ", "THREAD_REPLY"],
      }),
    ],
    completionPolicies: [],
    actorAuthorizations: [makeActorAuthorization()],
  };
}

function createService(store: WorkflowStore, clock: Clock): AccessGrantService {
  return new AccessGrantService(
    store,
    new SequenceIdGenerator(),
    new WebCryptoAccessGrantSecretManager(),
    clock,
  );
}

async function issue(service: AccessGrantService) {
  return service.issueAccessGrant({
    actor: actorContext(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    requestedOperations: ["THREAD_REPLY"],
    requestedLifetimeSeconds: 600,
  });
}

function replyInput(
  grant: Awaited<ReturnType<typeof issue>>,
): ReplyExternalConversationInput {
  return {
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    grantId: grant.grantId,
    secret: grant.secret,
    messageBody: "Synthetic guarded external follow-up.",
  };
}

async function expectExternalDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error("Expected external access denial.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe("EXTERNAL_ACCESS_DENIED");
  }
}

describe("AccessGrant external reply authority guard", () => {
  it("fails closed when revocation advances the grant after validation without changing thread version", async () => {
    const store = new RevocationRaceStore(seed());
    const clock = new MutableClock("2026-08-13T04:00:00.000Z");
    const service = createService(store, clock);
    const grant = await issue(service);
    const beforeThread = await store.getThread(DEPLOYMENT_A, THREAD_A);
    const beforeMessages = await store.listMessages(DEPLOYMENT_A, THREAD_A);
    const beforeAudit = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    store.armRevocation(grant.grantId, "2026-08-13T04:00:05.000Z");

    await expectExternalDenied(
      service.replyExternalConversation(replyInput(grant)),
    );

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(beforeThread);
    expect(await store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeMessages,
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(beforeAudit);
    expect(
      await store.getAccessGrant(DEPLOYMENT_A, grant.grantId),
    ).toMatchObject({
      version: 2,
      revokedAt: "2026-08-13T04:00:05.000Z",
    });
  });

  it("fails closed when initial validation is pre-expiry but the authoritative reply timestamp is expired", async () => {
    const store = new InMemoryWorkflowStore(seed());
    const clock = new SequenceClock([
      "2026-08-13T04:00:00.000Z",
      "2026-08-13T04:09:59.999Z",
      "2026-08-13T04:10:00.000Z",
    ]);
    const service = createService(store, clock);
    const grant = await issue(service);
    const beforeThread = await store.getThread(DEPLOYMENT_A, THREAD_A);
    const beforeMessages = await store.listMessages(DEPLOYMENT_A, THREAD_A);
    const beforeAudit = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);

    await expectExternalDenied(
      service.replyExternalConversation(replyInput(grant)),
    );

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(beforeThread);
    expect(await store.listMessages(DEPLOYMENT_A, THREAD_A)).toEqual(
      beforeMessages,
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(beforeAudit);
    expect(
      await store.getAccessGrant(DEPLOYMENT_A, grant.grantId),
    ).toMatchObject({
      version: 1,
      revokedAt: undefined,
    });
  });
});
