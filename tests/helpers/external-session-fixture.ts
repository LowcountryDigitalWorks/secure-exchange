import { AccessGrantService } from "../../src/application/access-grant-service.js";
import type { Clock } from "../../src/application/clock.js";
import { ExternalSessionService } from "../../src/application/external-session-service.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { SessionBackedExternalAccessService } from "../../src/application/session-backed-external-access-service.js";
import { InMemoryExternalSessionStore } from "../../src/adapters/in-memory-external-session-store.js";
import { InMemoryProtectedContentStore } from "../../src/adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";
import {
  WebCryptoBootstrapFormGuardManager,
  WebCryptoBootstrapProofManager,
  WebCryptoBrowserSessionSecretManager,
} from "../../src/adapters/web-crypto-external-session-security.js";
import type {
  AccessGrantOperation,
  ThreadLifecycleState,
} from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  STAFF_A,
  THREAD_A,
  actorContext,
  makeAccessGrantPolicy,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "./workflow-fixture.js";

export class MutableExternalSessionClock implements Clock {
  constructor(private value = "2026-08-14T12:00:00.000Z") {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

export class ExternalSessionSequenceIdGenerator implements OpaqueIdGenerator {
  private readonly counters = new Map<OpaqueIdPurpose, number>();

  generate(purpose: OpaqueIdPurpose): string {
    const next = (this.counters.get(purpose) ?? 0) + 1;
    this.counters.set(purpose, next);
    return `generated-${purpose}-${next}`;
  }
}

function syntheticKey(offset: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (index + offset) % 256);
}

export interface ExternalSessionFixture {
  readonly workflowStore: InMemoryWorkflowStore;
  readonly sessionStore: InMemoryExternalSessionStore;
  readonly contentStore: InMemoryProtectedContentStore;
  readonly accessGrants: AccessGrantService;
  readonly sessions: ExternalSessionService;
  readonly sessionAccess: SessionBackedExternalAccessService;
  readonly clock: MutableExternalSessionClock;
  readonly ids: ExternalSessionSequenceIdGenerator;
}

export function makeExternalSessionFixture(
  options: {
    readonly threadState?: ThreadLifecycleState;
    readonly allowedOperations?: readonly AccessGrantOperation[];
  } = {},
): ExternalSessionFixture {
  const clock = new MutableExternalSessionClock();
  const ids = new ExternalSessionSequenceIdGenerator();
  const workflowStore = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [makeThread({ state: options.threadState ?? "IN_PROGRESS" })],
    messages: [
      makeMessage(),
      makeMessage({
        messageId: "message-2",
        direction: "STAFF_TO_EXTERNAL",
        actorRef: STAFF_A,
        createdAt: "2026-08-14T11:55:00.000Z",
      }),
    ],
    accessGrantPolicies: [
      makeAccessGrantPolicy({
        maxLifetimeSeconds: 3_600,
        allowedOperations:
          options.allowedOperations ??
          (["THREAD_READ", "ATTACHMENT_READ", "THREAD_REPLY"] as const),
      }),
    ],
    completionPolicies: [],
    actorAuthorizations: [makeActorAuthorization()],
  });
  const sessionStore = new InMemoryExternalSessionStore();
  const contentStore = new InMemoryProtectedContentStore();
  const accessGrants = new AccessGrantService(
    workflowStore,
    ids,
    new WebCryptoAccessGrantSecretManager(),
    clock,
  );
  const sessions = new ExternalSessionService(
    workflowStore,
    sessionStore,
    ids,
    new WebCryptoBootstrapProofManager(syntheticKey(1)),
    new WebCryptoBootstrapFormGuardManager(syntheticKey(73)),
    new WebCryptoBrowserSessionSecretManager(),
    clock,
  );
  const sessionAccess = new SessionBackedExternalAccessService(
    workflowStore,
    sessionStore,
    contentStore,
    ids,
    clock,
  );
  return {
    workflowStore,
    sessionStore,
    contentStore,
    accessGrants,
    sessions,
    sessionAccess,
    clock,
    ids,
  };
}

export async function issueExternalGrant(
  fixture: ExternalSessionFixture,
  operations: readonly AccessGrantOperation[] = ["THREAD_READ"],
  lifetimeSeconds = 3_600,
) {
  return fixture.accessGrants.issueAccessGrant({
    actor: actorContext(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    requestedOperations: operations,
    requestedLifetimeSeconds: lifetimeSeconds,
  });
}

export async function establishExternalSession(
  fixture: ExternalSessionFixture,
  operations: readonly AccessGrantOperation[] = ["THREAD_READ"],
) {
  const grant = await issueExternalGrant(fixture, operations);
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
  return { grant, challenge, guard, session };
}
