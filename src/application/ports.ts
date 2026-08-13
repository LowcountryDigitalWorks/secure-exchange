import type {
  AccessGrant,
  AccessGrantId,
  AccessGrantOperation,
  AccessGrantPolicy,
  ActorAuthorization,
  Attachment,
  AttachmentFilePolicy,
  AttachmentId,
  AttachmentPolicyRef,
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

export interface AccessGrantUpdate {
  readonly expectedVersion: number;
  readonly accessGrant: AccessGrant;
}

export interface AccessGrantAuthorityGuard {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly grantId: AccessGrantId;
  readonly expectedVersion: number;
  readonly requiredOperation: AccessGrantOperation;
  readonly validAt: string;
}

export interface AttachmentCountGuard {
  readonly messageId: MessageId;
  readonly attachmentPolicyRef: AttachmentPolicyRef;
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
  readonly attachmentCountGuards?: readonly AttachmentCountGuard[];
  readonly newAccessGrants?: readonly AccessGrant[];
  readonly accessGrantUpdates?: readonly AccessGrantUpdate[];
  readonly accessGrantAuthorityGuards?: readonly AccessGrantAuthorityGuard[];
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

  getAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<AccessGrant | undefined>;

  getCurrentAccessGrantPolicy(
    deploymentId: DeploymentId,
  ): Promise<AccessGrantPolicy | undefined>;

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
