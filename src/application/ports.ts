import type {
  ActorAuthorization,
  Attachment,
  AttachmentFilePolicy,
  AttachmentId,
  ActorRef,
  AuditEvent,
  CompletionPolicy,
  DeploymentId,
  Message,
  MessageId,
  Queue,
  QueueId,
  Thread,
  ThreadId,
  TransferAttestation,
  TransferAttestationControl,
} from "../domain/index.js";

export interface AttachmentUpdate {
  readonly expectedVersion: number;
  readonly attachment: Attachment;
}

export interface WorkflowMutation {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly expectedThreadVersion?: number;
  readonly newThread?: Thread;
  readonly nextThread?: Thread;
  readonly messages?: readonly Message[];
  readonly newAttachments?: readonly Attachment[];
  readonly attachmentUpdates?: readonly AttachmentUpdate[];
  readonly auditEvents?: readonly AuditEvent[];
  readonly transferAttestations?: readonly TransferAttestation[];
  readonly transferAttestationControls?: readonly TransferAttestationControl[];
}

export interface WorkflowStore {
  getQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<Queue | undefined>;

  getThread(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<Thread | undefined>;

  listThreadsForQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<readonly Thread[]>;

  listMessages(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly Message[]>;

  getMessage(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
  ): Promise<Message | undefined>;

  getAttachment(
    deploymentId: DeploymentId,
    attachmentId: AttachmentId,
  ): Promise<Attachment | undefined>;

  listAttachmentsForMessage(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
  ): Promise<readonly Attachment[]>;

  getCurrentAttachmentFilePolicy(
    deploymentId: DeploymentId,
  ): Promise<AttachmentFilePolicy | undefined>;

  getCurrentCompletionPolicy(
    deploymentId: DeploymentId,
  ): Promise<CompletionPolicy | undefined>;

  getActorAuthorization(
    deploymentId: DeploymentId,
    actorRef: ActorRef,
  ): Promise<ActorAuthorization | undefined>;

  listTransferAttestations(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestation[]>;

  listTransferAttestationControls(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestationControl[]>;

  commit(mutation: WorkflowMutation): Promise<void>;
}
