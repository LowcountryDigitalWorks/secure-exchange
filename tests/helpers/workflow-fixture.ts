import type {
  AccessGrantPolicy,
  ActorAuthorization,
  ActorContext,
  CompletionPolicy,
  Message,
  Queue,
  Thread,
  ThreadLifecycleState,
  TransferAttestation,
  WorkflowPermission,
} from "../../src/domain/index.js";
import { createPlainTextMessageBody } from "../../src/domain/message.js";
import { WorkflowService } from "../../src/application/workflow-service.js";
import { ConversationService } from "../../src/application/conversation-service.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";

export const DEPLOYMENT_A = "deployment-a";
export const DEPLOYMENT_B = "deployment-b";
export const THREAD_A = "thread-a";
export const THREAD_B = "thread-b";
export const QUEUE_A = "queue-a";
export const QUEUE_B = "queue-b";
export const STAFF_A = "staff-a";
export const STAFF_B = "staff-b";
export const UNAUTHORIZED_STAFF = "staff-unauthorized";
export const EXTERNAL_A = "external-participant-a";
export const POLICY_A = "completion-policy-a-v1";
export const POLICY_B = "completion-policy-b-v1";
export const ACCESS_POLICY_A = "access-policy-a-v1";
export const ROUTING_GENERAL = "GENERAL";
export const ROUTING_RECORDS = "RECORDS";

export const ALL_WORKFLOW_PERMISSIONS: readonly WorkflowPermission[] = [
  "QUEUE_LIST",
  "THREAD_OPEN",
  "THREAD_REPLY",
  "ATTACHMENT_READ",
  "ACCESS_GRANT_ISSUE",
  "ACCESS_GRANT_REVOKE",
  "THREAD_TRANSITION",
  "THREAD_DISPOSE",
  "TRANSFER_ATTEST",
  "TRANSFER_ATTESTATION_SUPERSEDE",
  "TRANSFER_ATTESTATION_INVALIDATE",
  "THREAD_COMPLETE",
];

export function makeQueue(overrides: Partial<Queue> = {}): Queue {
  return {
    queueId: QUEUE_A,
    deploymentId: DEPLOYMENT_A,
    active: true,
    displayLabel: "Synthetic General Queue",
    allowedRoutingCategories: [ROUTING_GENERAL, ROUTING_RECORDS],
    ...overrides,
  };
}

export function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    queueId: QUEUE_A,
    routingCategory: ROUTING_GENERAL,
    state: "IN_PROGRESS",
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    lastActivityAt: "2026-08-12T12:00:00.000Z",
    attentionAt: "2026-08-12T12:00:00.000Z",
    version: 3,
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    messageId: "message-1",
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    direction: "EXTERNAL_TO_STAFF",
    actorRef: EXTERNAL_A,
    createdAt: "2026-08-12T12:01:00.000Z",
    body: createPlainTextMessageBody("Synthetic message body."),
    ...overrides,
  };
}

export function makeActorAuthorization(
  overrides: Partial<ActorAuthorization> = {},
): ActorAuthorization {
  return {
    actorRef: STAFF_A,
    deploymentId: DEPLOYMENT_A,
    actorKind: "STAFF",
    active: true,
    allowedQueueIds: [QUEUE_A],
    permissions: ALL_WORKFLOW_PERMISSIONS,
    ...overrides,
  };
}

export function actorContext(
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    actorRef: STAFF_A,
    deploymentId: DEPLOYMENT_A,
    actorKind: "STAFF",
    ...overrides,
  };
}

export function makeCompletionPolicy(
  overrides: Partial<CompletionPolicy> = {},
): CompletionPolicy {
  return {
    policyRef: POLICY_A,
    deploymentId: DEPLOYMENT_A,
    requiresTransferAttestation: true,
    qualifyingOutcomes: ["TRANSFERRED", "FILED"],
    allowedDestinationCategories: ["RECORD_SYSTEM", "ARCHIVE"],
    ...overrides,
  };
}

export function makeAccessGrantPolicy(
  overrides: Partial<AccessGrantPolicy> = {},
): AccessGrantPolicy {
  return {
    policyRef: ACCESS_POLICY_A,
    deploymentId: DEPLOYMENT_A,
    maxLifetimeSeconds: 3_600,
    allowedOperations: ["THREAD_READ"],
    ...overrides,
  };
}

export function makeAttestation(
  overrides: Partial<TransferAttestation> = {},
): TransferAttestation {
  return {
    attestationId: "attestation-1",
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    actorRef: STAFF_A,
    attestedAt: "2026-08-12T12:05:00.000Z",
    outcome: "TRANSFERRED",
    destinationCategory: "RECORD_SYSTEM",
    completionPolicyRef: POLICY_A,
    ...overrides,
  };
}

export function makeFixture(
  options: {
    readonly threadState?: ThreadLifecycleState;
    readonly threadVersion?: number;
    readonly policy?: CompletionPolicy;
    readonly accessGrantPolicy?: AccessGrantPolicy;
    readonly queues?: readonly Queue[];
    readonly additionalThreads?: readonly Thread[];
    readonly messages?: readonly Message[];
    readonly additionalActors?: readonly ActorAuthorization[];
    readonly attestations?: readonly TransferAttestation[];
  } = {},
): {
  readonly store: InMemoryWorkflowStore;
  readonly service: WorkflowService;
  readonly conversationService: ConversationService;
  readonly thread: Thread;
} {
  const thread = makeThread({
    ...(options.threadState === undefined
      ? {}
      : { state: options.threadState }),
    ...(options.threadVersion === undefined
      ? {}
      : { version: options.threadVersion }),
  });
  const store = new InMemoryWorkflowStore({
    queues: options.queues ?? [makeQueue()],
    threads: [thread, ...(options.additionalThreads ?? [])],
    messages: options.messages ?? [],
    accessGrantPolicies: [options.accessGrantPolicy ?? makeAccessGrantPolicy()],
    completionPolicies: [options.policy ?? makeCompletionPolicy()],
    actorAuthorizations: [
      makeActorAuthorization(),
      ...(options.additionalActors ?? []),
    ],
    ...(options.attestations === undefined
      ? {}
      : { transferAttestations: options.attestations }),
  });
  return {
    store,
    service: new WorkflowService(store),
    conversationService: new ConversationService(store),
    thread,
  };
}
