import {
  evaluateCompletionPolicy,
  transitionThread,
  type ActorAuthorization,
  type ActorContext,
  type AttachmentId,
  type AuditEvent,
  type AuditEventId,
  type CompletionPolicy,
  type DeploymentId,
  type Thread,
  type ThreadId,
  type ThreadLifecycleState,
  type TransferAttestation,
  type TransferAttestationControl,
  type TransferAttestationControlId,
  type TransferAttestationControlReason,
  type TransferAttestationId,
  type TransferAttestationOutcome,
  type WorkflowPermission,
} from "../domain/index.js";
import { ApplicationError } from "./errors.js";
import type { WorkflowStore } from "./ports.js";

interface ThreadActionInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
}

export interface RecordOpenedInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly at: string;
}

export interface RecordDownloadEvidenceInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly attachmentId: AttachmentId;
  readonly at: string;
}

export interface TransitionThreadInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly expectedVersion: number;
  readonly targetState: ThreadLifecycleState;
  readonly at: string;
  readonly dispositionDueAt?: string;
}

export interface AppendTransferAttestationInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly attestationId: TransferAttestationId;
  readonly at: string;
  readonly outcome: TransferAttestationOutcome;
  readonly destinationCategory: string;
}

export interface SupersedeTransferAttestationInput extends AppendTransferAttestationInput {
  readonly controlId: TransferAttestationControlId;
  readonly targetAttestationId: TransferAttestationId;
  readonly reasonCode: TransferAttestationControlReason;
  readonly supersedeAuditEventId: AuditEventId;
}

export interface InvalidateTransferAttestationInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly controlId: TransferAttestationControlId;
  readonly targetAttestationId: TransferAttestationId;
  readonly reasonCode: TransferAttestationControlReason;
  readonly at: string;
}

export interface CompleteThreadInput extends ThreadActionInput {
  readonly auditEventId: AuditEventId;
  readonly expectedVersion: number;
  readonly at: string;
  readonly dispositionDueAt?: string;
}

interface AuthorizedThread {
  readonly thread: Thread;
  readonly authorization: ActorAuthorization;
}

export class WorkflowService {
  constructor(private readonly store: WorkflowStore) {}

  async recordOpened(input: RecordOpenedInput): Promise<void> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "THREAD_OPEN",
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      auditEvents: [
        this.auditEvent(
          input,
          authorization,
          thread,
          "THREAD_OPENED",
          input.auditEventId,
          input.at,
        ),
      ],
    });
  }

  async recordDownloadEvidence(
    input: RecordDownloadEvidenceInput,
  ): Promise<void> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "DOWNLOAD_EVIDENCE_RECORD",
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "ATTACHMENT_DOWNLOADED",
            input.auditEventId,
            input.at,
          ),
          attachmentId: input.attachmentId,
        },
      ],
    });
  }

  async transitionThread(input: TransitionThreadInput): Promise<Thread> {
    if (input.targetState === "COMPLETED") {
      throw new ApplicationError(
        "USE_COMPLETION_SERVICE",
        "Completion must be attempted through the completion-policy path.",
      );
    }

    const requiredPermission: WorkflowPermission =
      input.targetState === "DISPOSED" ? "THREAD_DISPOSE" : "THREAD_TRANSITION";
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      requiredPermission,
    );

    const nextThread = transitionThread(
      thread,
      input.targetState,
      input.expectedVersion,
      {
        at: input.at,
        ...(input.dispositionDueAt === undefined
          ? {}
          : { dispositionDueAt: input.dispositionDueAt }),
      },
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: input.expectedVersion,
      nextThread,
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "THREAD_LIFECYCLE_TRANSITIONED",
            input.auditEventId,
            input.at,
          ),
          fromState: thread.state,
          toState: nextThread.state,
        },
      ],
    });

    return nextThread;
  }

  async appendTransferAttestation(
    input: AppendTransferAttestationInput,
  ): Promise<TransferAttestation> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "TRANSFER_ATTEST",
    );
    this.requireStaffActor(authorization);
    const policy = await this.loadCompletionPolicy(input.deploymentId);

    const attestation = this.transferAttestation(input, authorization, policy);

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      transferAttestations: [attestation],
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "TRANSFER_ATTESTED",
            input.auditEventId,
            input.at,
          ),
          attestationId: attestation.attestationId,
        },
      ],
    });

    return attestation;
  }

  async supersedeTransferAttestation(
    input: SupersedeTransferAttestationInput,
  ): Promise<TransferAttestation> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "TRANSFER_ATTESTATION_SUPERSEDE",
    );
    this.requireStaffActor(authorization);
    await this.requireControllableAttestation(
      input.deploymentId,
      input.threadId,
      input.targetAttestationId,
    );
    const policy = await this.loadCompletionPolicy(input.deploymentId);
    const replacement = this.transferAttestation(input, authorization, policy);

    const control: TransferAttestationControl = {
      controlId: input.controlId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      targetAttestationId: input.targetAttestationId,
      actorRef: authorization.actorRef,
      at: input.at,
      action: "SUPERSEDE",
      reasonCode: input.reasonCode,
      replacementAttestationId: replacement.attestationId,
    };

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      transferAttestations: [replacement],
      transferAttestationControls: [control],
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "TRANSFER_ATTESTED",
            input.auditEventId,
            input.at,
          ),
          attestationId: replacement.attestationId,
        },
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "TRANSFER_ATTESTATION_SUPERSEDED",
            input.supersedeAuditEventId,
            input.at,
          ),
          attestationId: input.targetAttestationId,
          relatedAttestationId: replacement.attestationId,
        },
      ],
    });

    return replacement;
  }

  async invalidateTransferAttestation(
    input: InvalidateTransferAttestationInput,
  ): Promise<void> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "TRANSFER_ATTESTATION_INVALIDATE",
    );
    this.requireStaffActor(authorization);
    await this.requireControllableAttestation(
      input.deploymentId,
      input.threadId,
      input.targetAttestationId,
    );

    const control: TransferAttestationControl = {
      controlId: input.controlId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      targetAttestationId: input.targetAttestationId,
      actorRef: authorization.actorRef,
      at: input.at,
      action: "INVALIDATE",
      reasonCode: input.reasonCode,
    };

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      transferAttestationControls: [control],
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "TRANSFER_ATTESTATION_INVALIDATED",
            input.auditEventId,
            input.at,
          ),
          attestationId: input.targetAttestationId,
        },
      ],
    });
  }

  async completeThread(input: CompleteThreadInput): Promise<Thread> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "THREAD_COMPLETE",
    );
    const policy = await this.loadCompletionPolicy(input.deploymentId);
    const attestations = await this.store.listTransferAttestations(
      input.deploymentId,
      input.threadId,
    );
    const controls = await this.store.listTransferAttestationControls(
      input.deploymentId,
      input.threadId,
    );
    const authorizedActorRefs = await this.authorizedAttestationActors(
      thread,
      attestations,
    );
    const decision = evaluateCompletionPolicy({
      policy,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      attestations,
      controls,
      authorizedAttestationActorRefs: authorizedActorRefs,
    });

    if (!decision.allowed) {
      throw new ApplicationError(
        "COMPLETION_PRECONDITION_FAILED",
        `Completion policy rejected the attempt: ${decision.reason}.`,
      );
    }

    const nextThread = transitionThread(
      thread,
      "COMPLETED",
      input.expectedVersion,
      {
        at: input.at,
        ...(input.dispositionDueAt === undefined
          ? {}
          : { dispositionDueAt: input.dispositionDueAt }),
      },
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: input.expectedVersion,
      nextThread,
      auditEvents: [
        {
          ...this.auditEvent(
            input,
            authorization,
            thread,
            "THREAD_COMPLETED",
            input.auditEventId,
            input.at,
          ),
          fromState: thread.state,
          toState: nextThread.state,
          ...(decision.qualifyingAttestationId === undefined
            ? {}
            : { attestationId: decision.qualifyingAttestationId }),
        },
      ],
    });

    return nextThread;
  }

  private async loadAuthorizedThread(
    input: ThreadActionInput,
    permission: WorkflowPermission,
  ): Promise<AuthorizedThread> {
    if (input.actor.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor deployment does not match the requested deployment.",
      );
    }

    const thread = await this.store.getThread(
      input.deploymentId,
      input.threadId,
    );
    if (thread === undefined || thread.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Authoritative thread was not found in the requested deployment.",
      );
    }

    const authorization = await this.store.getActorAuthorization(
      input.deploymentId,
      input.actor.actorRef,
    );
    if (
      authorization === undefined ||
      !authorization.active ||
      authorization.deploymentId !== input.deploymentId ||
      authorization.actorKind !== input.actor.actorKind ||
      !authorization.allowedQueueIds.includes(thread.queueId) ||
      !authorization.permissions.includes(permission)
    ) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor is not authorized for this authoritative thread action.",
      );
    }

    return { thread, authorization };
  }

  private async loadCompletionPolicy(
    deploymentId: DeploymentId,
  ): Promise<CompletionPolicy> {
    const policy = await this.store.getCurrentCompletionPolicy(deploymentId);
    if (policy === undefined || policy.deploymentId !== deploymentId) {
      throw new ApplicationError(
        "POLICY_NOT_FOUND",
        "Current completion policy is unavailable for the deployment.",
      );
    }
    return policy;
  }

  private requireStaffActor(authorization: ActorAuthorization): void {
    if (authorization.actorKind !== "STAFF") {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Transfer attestations require an authenticated staff actor.",
      );
    }
  }

  private async requireControllableAttestation(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    attestationId: TransferAttestationId,
  ): Promise<void> {
    const attestations = await this.store.listTransferAttestations(
      deploymentId,
      threadId,
    );
    if (!attestations.some((item) => item.attestationId === attestationId)) {
      throw new ApplicationError(
        "ATTESTATION_NOT_FOUND",
        "Transfer attestation was not found for the authoritative thread.",
      );
    }

    const controls = await this.store.listTransferAttestationControls(
      deploymentId,
      threadId,
    );
    if (
      controls.some((control) => control.targetAttestationId === attestationId)
    ) {
      throw new ApplicationError(
        "ATTESTATION_ALREADY_CONTROLLED",
        "Transfer attestation has already been superseded or invalidated.",
      );
    }
  }

  private async authorizedAttestationActors(
    thread: Thread,
    attestations: readonly TransferAttestation[],
  ): Promise<ReadonlySet<string>> {
    const authorized = new Set<string>();
    const actorRefs = new Set(attestations.map((item) => item.actorRef));

    for (const actorRef of actorRefs) {
      const actor = await this.store.getActorAuthorization(
        thread.deploymentId,
        actorRef,
      );
      if (
        actor !== undefined &&
        actor.active &&
        actor.actorKind === "STAFF" &&
        actor.deploymentId === thread.deploymentId &&
        actor.allowedQueueIds.includes(thread.queueId) &&
        actor.permissions.includes("TRANSFER_ATTEST")
      ) {
        authorized.add(actorRef);
      }
    }

    return authorized;
  }

  private transferAttestation(
    input: AppendTransferAttestationInput,
    authorization: ActorAuthorization,
    policy: CompletionPolicy,
  ): TransferAttestation {
    return {
      attestationId: input.attestationId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      actorRef: authorization.actorRef,
      attestedAt: input.at,
      outcome: input.outcome,
      destinationCategory: input.destinationCategory,
      completionPolicyRef: policy.policyRef,
    };
  }

  private auditEvent(
    input: ThreadActionInput,
    authorization: ActorAuthorization,
    thread: Thread,
    eventType: AuditEvent["eventType"],
    eventId: AuditEventId,
    at: string,
  ): AuditEvent {
    return {
      eventId,
      deploymentId: input.deploymentId,
      threadId: thread.threadId,
      eventType,
      actorRef: authorization.actorRef,
      actorKind: authorization.actorKind,
      at,
      outcome: "SUCCEEDED",
    };
  }
}
