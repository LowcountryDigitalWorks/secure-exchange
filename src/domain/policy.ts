import type {
  ActorRef,
  CompletionPolicyRef,
  DeploymentId,
  ThreadId,
} from "./types.js";
import type {
  TransferAttestation,
  TransferAttestationControl,
  TransferAttestationOutcome,
} from "./evidence.js";

export interface CompletionPolicy {
  readonly policyRef: CompletionPolicyRef;
  readonly deploymentId: DeploymentId;
  readonly requiresTransferAttestation: boolean;
  readonly qualifyingOutcomes: readonly TransferAttestationOutcome[];
  readonly allowedDestinationCategories: readonly string[];
}

export type CompletionPolicyFailureReason =
  "INVALID_POLICY" | "QUALIFYING_TRANSFER_ATTESTATION_REQUIRED";

export type CompletionPolicyDecision =
  | { readonly allowed: true; readonly qualifyingAttestationId?: string }
  | { readonly allowed: false; readonly reason: CompletionPolicyFailureReason };

export interface CompletionPolicyEvaluationInput {
  readonly policy: CompletionPolicy;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly attestations: readonly TransferAttestation[];
  readonly controls: readonly TransferAttestationControl[];
  readonly authorizedAttestationActorRefs: ReadonlySet<ActorRef>;
}

export function evaluateCompletionPolicy(
  input: CompletionPolicyEvaluationInput,
): CompletionPolicyDecision {
  const { policy } = input;

  if (policy.deploymentId !== input.deploymentId) {
    return { allowed: false, reason: "INVALID_POLICY" };
  }

  if (!policy.requiresTransferAttestation) {
    return { allowed: true };
  }

  if (
    policy.qualifyingOutcomes.length === 0 ||
    policy.allowedDestinationCategories.length === 0
  ) {
    return { allowed: false, reason: "INVALID_POLICY" };
  }

  const disqualifiedAttestationIds = new Set(
    input.controls
      .filter(
        (control) =>
          control.deploymentId === input.deploymentId &&
          control.threadId === input.threadId,
      )
      .map((control) => control.targetAttestationId),
  );

  const qualifying = input.attestations.find(
    (attestation) =>
      attestation.deploymentId === input.deploymentId &&
      attestation.threadId === input.threadId &&
      attestation.completionPolicyRef === policy.policyRef &&
      policy.qualifyingOutcomes.includes(attestation.outcome) &&
      policy.allowedDestinationCategories.includes(
        attestation.destinationCategory,
      ) &&
      input.authorizedAttestationActorRefs.has(attestation.actorRef) &&
      !disqualifiedAttestationIds.has(attestation.attestationId),
  );

  if (qualifying === undefined) {
    return {
      allowed: false,
      reason: "QUALIFYING_TRANSFER_ATTESTATION_REQUIRED",
    };
  }

  return {
    allowed: true,
    qualifyingAttestationId: qualifying.attestationId,
  };
}
