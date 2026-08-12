import type {
  ActorKind,
  ActorRef,
  AttachmentId,
  AuditEventId,
  CompletionPolicyRef,
  DeploymentId,
  ThreadId,
  TransferAttestationControlId,
  TransferAttestationId,
} from "./types.js";
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
  | "THREAD_OPENED"
  | "ATTACHMENT_DOWNLOADED"
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
  readonly actorKind: ActorKind;
  readonly at: string;
  readonly attachmentId?: AttachmentId;
  readonly attestationId?: TransferAttestationId;
  readonly relatedAttestationId?: TransferAttestationId;
  readonly fromState?: ThreadLifecycleState;
  readonly toState?: ThreadLifecycleState;
  readonly outcome: "SUCCEEDED";
}
