import { ConversationService } from "../application/conversation-service.js";
import type { OpaqueIdGenerator } from "../application/id-generator.js";
import { WorkflowService } from "../application/workflow-service.js";
import { InMemoryWorkflowStore } from "../adapters/in-memory-workflow-store.js";
import { WebCryptoOpaqueIdGenerator } from "../adapters/web-crypto-id-generator.js";
import type { ActorContext, Queue } from "../domain/index.js";

export const SYNTHETIC_DEPLOYMENT_ID = "synthetic-development-deployment";
export const SYNTHETIC_QUEUE_ID = "synthetic-development-queue";
export const SYNTHETIC_STAFF_ACTOR_REF = "synthetic-development-staff";

export const SYNTHETIC_ROUTING_CHOICES = [
  { value: "GENERAL", label: "General" },
  { value: "RECORDS", label: "Records" },
] as const;

export interface DevelopmentDemoRuntime {
  readonly store: InMemoryWorkflowStore;
  readonly conversationService: ConversationService;
  readonly workflowService: WorkflowService;
  readonly idGenerator: OpaqueIdGenerator;
  readonly now: () => string;
  readonly deploymentId: string;
  readonly queueId: string;
  readonly queueLabel: string;
  readonly routingChoices: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly staffActor: ActorContext;
  readonly staffContextLabel: string;
}

export interface LocalDevelopmentDemoOptions {
  readonly idGenerator?: OpaqueIdGenerator;
  readonly now?: () => string;
  readonly queueActive?: boolean;
}

export function createLocalDevelopmentDemoRuntime(
  options: LocalDevelopmentDemoOptions = {},
): DevelopmentDemoRuntime {
  const queue: Queue = {
    queueId: SYNTHETIC_QUEUE_ID,
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    active: options.queueActive ?? true,
    displayLabel: "Synthetic Intake Queue",
    allowedRoutingCategories: SYNTHETIC_ROUTING_CHOICES.map(
      (choice) => choice.value,
    ),
  };
  const staffActor: ActorContext = {
    actorRef: SYNTHETIC_STAFF_ACTOR_REF,
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    actorKind: "STAFF",
  };
  const store = new InMemoryWorkflowStore({
    queues: [queue],
    actorAuthorizations: [
      {
        ...staffActor,
        active: true,
        allowedQueueIds: [SYNTHETIC_QUEUE_ID],
        permissions: [
          "QUEUE_LIST",
          "THREAD_OPEN",
          "THREAD_REPLY",
          "THREAD_TRANSITION",
        ],
      },
    ],
  });

  return {
    store,
    conversationService: new ConversationService(store),
    workflowService: new WorkflowService(store),
    idGenerator: options.idGenerator ?? new WebCryptoOpaqueIdGenerator(),
    now: options.now ?? (() => new Date().toISOString()),
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    queueId: SYNTHETIC_QUEUE_ID,
    queueLabel: queue.displayLabel,
    routingChoices: SYNTHETIC_ROUTING_CHOICES,
    staffActor,
    staffContextLabel: "Synthetic Staff Context",
  };
}
