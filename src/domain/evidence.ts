import type {
  AccessGrantId,
  ActorRef,
  AttachmentId,
  AuditActorKind,
  AuditEventId,
  CompletionPolicyRef,
  DeploymentId,
  MessageId,
  ThreadId,
  TransferAttestationControlId,
  TransferAttestationId,
} from "./types.js";
import type {
  AttachmentSafetyState,
  AttachmentScanOutcome,
} from "./attachment.js";
import type { ThreadLifecycleState } from "./thread.js";

export type TransferAttestationOutcome = "TRANSFERRED" | "FILED" | "FAILED";

export interface TransferAttestation {
  readonly attestationId: TransferAttestationId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly actorRef: ActorRef;
  readonly attestedAt: string;
  readonly outcome: TransferAttestationOutcome;
  readonly destinationCategory: string;
  readonly completionPolicyRef: CompletionPolicyRef;
}

export type TransferAttestationControlAction = "SUPERSEDE" | "INVALIDATE";

export type TransferAttestationControlReason =
  "CORRECTION" | "ENTERED_IN_ERROR" | "POLICY_MISMATCH";

export interface TransferAttestationControl {
  readonly controlId: TransferAttestationControlId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly targetAttestationId: TransferAttestationId;
  readonly actorRef: ActorRef;
  readonly at: string;
  readonly action: TransferAttestationControlAction;
  readonly reasonCode: TransferAttestationControlReason;
  readonly replacementAttestationId?: TransferAttestationId;
}

export type AuditEventType =
  | "THREAD_CREATED"
  | "MESSAGE_APPENDED"
  | "THREAD_OPENED"
  | "ATTACHMENT_REGISTERED"
  | "ATTACHMENT_QUARANTINED"
  | "ATTACHMENT_SCAN_ACCEPTED"
  | "ATTACHMENT_SCAN_INDETERMINATE"
  | "ATTACHMENT_REJECTED"
  | "ATTACHMENT_DOWNLOADED"
  | "ACCESS_GRANT_ISSUED"
  | "ACCESS_GRANT_REVOKED"
  | "EXTERNAL_THREAD_RETRIEVED"
  | "THREAD_LIFECYCLE_TRANSITIONED"
  | "TRANSFER_ATTESTED"
  | "TRANSFER_ATTESTATION_SUPERSEDED"
  | "TRANSFER_ATTESTATION_INVALIDATED"
  | "THREAD_COMPLETED";

export interface AuditEvent {
  readonly eventId: AuditEventId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly eventType: AuditEventType;
  readonly actorRef: ActorRef;
  readonly actorKind: AuditActorKind;
  readonly at: string;
  readonly messageId?: MessageId;
  readonly attachmentId?: AttachmentId;
  readonly accessGrantId?: AccessGrantId;
  readonly attachmentState?: AttachmentSafetyState;
  readonly scanOutcome?: AttachmentScanOutcome;
  readonly attestationId?: TransferAttestationId;
  readonly relatedAttestationId?: TransferAttestationId;
  readonly fromState?: ThreadLifecycleState;
  readonly toState?: ThreadLifecycleState;
  readonly outcome: "SUCCEEDED";
}
