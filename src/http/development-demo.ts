import { AccessGrantService } from "../application/access-grant-service.js";
import { AttachmentService } from "../application/attachment-service.js";
import type { Clock } from "../application/clock.js";
import { ConversationService } from "../application/conversation-service.js";
import { ExternalAttachmentRetrievalService } from "../application/external-attachment-retrieval-service.js";
import type { OpaqueIdGenerator } from "../application/id-generator.js";
import { WorkflowService } from "../application/workflow-service.js";
import { InMemoryProtectedContentStore } from "../adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../adapters/web-crypto-access-grant-secret.js";
import { WebCryptoOpaqueIdGenerator } from "../adapters/web-crypto-id-generator.js";
import type {
  AccessGrantPolicy,
  ActorContext,
  AttachmentFilePolicy,
  Queue,
} from "../domain/index.js";

export const SYNTHETIC_DEPLOYMENT_ID = "synthetic-development-deployment";
export const SYNTHETIC_QUEUE_ID = "synthetic-development-queue";
export const SYNTHETIC_STAFF_ACTOR_REF = "synthetic-development-staff";
export const SYNTHETIC_SYSTEM_ACTOR_REF = "synthetic-development-system";
export const SYNTHETIC_ACCESS_GRANT_POLICY_REF =
  "synthetic-development-access-policy-v1";
export const SYNTHETIC_ATTACHMENT_POLICY_REF =
  "synthetic-development-attachment-policy-v1";

export const SYNTHETIC_ROUTING_CHOICES = [
  { value: "GENERAL", label: "General" },
  { value: "RECORDS", label: "Records" },
] as const;

export interface DevelopmentDemoRuntime {
  readonly store: InMemoryWorkflowStore;
  readonly contentStore: InMemoryProtectedContentStore;
  readonly conversationService: ConversationService;
  readonly workflowService: WorkflowService;
  readonly attachmentService: AttachmentService;
  readonly accessGrantService: AccessGrantService;
  readonly externalAttachmentRetrievalService: ExternalAttachmentRetrievalService;
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
  const attachmentPolicy: AttachmentFilePolicy = {
    policyRef: SYNTHETIC_ATTACHMENT_POLICY_REF,
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    maxAttachmentSizeBytes: 2 * 1024 * 1024,
    maxAttachmentsPerMessage: 4,
    allowedMediaCategories: ["DOCUMENT", "TEXT"],
    allowedMediaTypes: ["application/pdf", "text/plain"],
    allowedExtensions: ["pdf", "txt"],
  };
  const accessGrantPolicy: AccessGrantPolicy = {
    policyRef: SYNTHETIC_ACCESS_GRANT_POLICY_REF,
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    maxLifetimeSeconds: 3_600,
    allowedOperations: ["THREAD_READ", "ATTACHMENT_READ"],
  };
  const store = new InMemoryWorkflowStore({
    queues: [queue],
    attachmentPolicies: [attachmentPolicy],
    accessGrantPolicies: [accessGrantPolicy],
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
          "ATTACHMENT_READ",
          "ACCESS_GRANT_ISSUE",
          "ACCESS_GRANT_REVOKE",
        ],
      },
    ],
  });
  const contentStore = new InMemoryProtectedContentStore();
  const idGenerator = options.idGenerator ?? new WebCryptoOpaqueIdGenerator();
  const now = options.now ?? (() => new Date().toISOString());
  const clock: Clock = { now };
  const accessGrantService = new AccessGrantService(
    store,
    idGenerator,
    new WebCryptoAccessGrantSecretManager(),
    clock,
  );

  return {
    store,
    contentStore,
    conversationService: new ConversationService(store),
    workflowService: new WorkflowService(store),
    attachmentService: new AttachmentService(
      store,
      contentStore,
      idGenerator,
      SYNTHETIC_SYSTEM_ACTOR_REF,
    ),
    accessGrantService,
    externalAttachmentRetrievalService: new ExternalAttachmentRetrievalService(
      store,
      contentStore,
      idGenerator,
      accessGrantService,
      clock,
    ),
    idGenerator,
    now,
    deploymentId: SYNTHETIC_DEPLOYMENT_ID,
    queueId: SYNTHETIC_QUEUE_ID,
    queueLabel: queue.displayLabel,
    routingChoices: SYNTHETIC_ROUTING_CHOICES,
    staffActor,
    staffContextLabel: "Synthetic Staff Context",
  };
}
