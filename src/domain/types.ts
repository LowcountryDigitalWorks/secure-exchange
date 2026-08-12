export type DeploymentId = string;
export type ThreadId = string;
export type QueueId = string;
export type MessageId = string;
export type ActorRef = string;
export type ExternalParticipantRef = string;
export type AuditEventId = string;
export type TransferAttestationId = string;
export type TransferAttestationControlId = string;
export type AttachmentId = string;
export type CompletionPolicyRef = string;

export type ActorKind = "STAFF" | "ADMIN" | "SYSTEM";
export type AuditActorKind = ActorKind | "EXTERNAL";

export type WorkflowPermission =
  | "QUEUE_LIST"
  | "THREAD_OPEN"
  | "THREAD_REPLY"
  | "DOWNLOAD_EVIDENCE_RECORD"
  | "THREAD_TRANSITION"
  | "THREAD_DISPOSE"
  | "TRANSFER_ATTEST"
  | "TRANSFER_ATTESTATION_SUPERSEDE"
  | "TRANSFER_ATTESTATION_INVALIDATE"
  | "THREAD_COMPLETE";

export interface ActorContext {
  readonly actorRef: ActorRef;
  readonly deploymentId: DeploymentId;
  readonly actorKind: ActorKind;
}

export interface ActorAuthorization {
  readonly actorRef: ActorRef;
  readonly deploymentId: DeploymentId;
  readonly actorKind: ActorKind;
  readonly active: boolean;
  readonly allowedQueueIds: readonly QueueId[];
  readonly permissions: readonly WorkflowPermission[];
}
