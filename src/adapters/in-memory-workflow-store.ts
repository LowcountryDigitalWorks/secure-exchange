import { DomainError } from "../domain/errors.js";
import type {
  ActorAuthorization,
  ActorRef,
  AuditEvent,
  CompletionPolicy,
  DeploymentId,
  Thread,
  ThreadId,
  TransferAttestation,
  TransferAttestationControl,
} from "../domain/index.js";
import type { WorkflowMutation, WorkflowStore } from "../application/ports.js";

export interface InMemoryWorkflowSeed {
  readonly threads?: readonly Thread[];
  readonly completionPolicies?: readonly CompletionPolicy[];
  readonly actorAuthorizations?: readonly ActorAuthorization[];
  readonly auditEvents?: readonly AuditEvent[];
  readonly transferAttestations?: readonly TransferAttestation[];
  readonly transferAttestationControls?: readonly TransferAttestationControl[];
}

function resourceKey(deploymentId: string, resourceId: string): string {
  return `${deploymentId}\u0000${resourceId}`;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  private threads: Map<string, Thread>;
  private completionPolicies: Map<string, CompletionPolicy>;
  private actorAuthorizations: Map<string, ActorAuthorization>;
  private auditEvents: AuditEvent[];
  private transferAttestations: TransferAttestation[];
  private transferAttestationControls: TransferAttestationControl[];
  private failNextCommitRequested = false;

  constructor(seed: InMemoryWorkflowSeed = {}) {
    this.threads = new Map(
      (seed.threads ?? []).map((thread) => [
        resourceKey(thread.deploymentId, thread.threadId),
        thread,
      ]),
    );
    this.completionPolicies = new Map(
      (seed.completionPolicies ?? []).map((policy) => [
        policy.deploymentId,
        policy,
      ]),
    );
    this.actorAuthorizations = new Map(
      (seed.actorAuthorizations ?? []).map((authorization) => [
        resourceKey(authorization.deploymentId, authorization.actorRef),
        authorization,
      ]),
    );
    this.auditEvents = [...(seed.auditEvents ?? [])];
    this.transferAttestations = [...(seed.transferAttestations ?? [])];
    this.transferAttestationControls = [
      ...(seed.transferAttestationControls ?? []),
    ];
  }

  getThread(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<Thread | undefined> {
    return Promise.resolve(
      this.threads.get(resourceKey(deploymentId, threadId)),
    );
  }

  getCurrentCompletionPolicy(
    deploymentId: DeploymentId,
  ): Promise<CompletionPolicy | undefined> {
    return Promise.resolve(this.completionPolicies.get(deploymentId));
  }

  getActorAuthorization(
    deploymentId: DeploymentId,
    actorRef: ActorRef,
  ): Promise<ActorAuthorization | undefined> {
    return Promise.resolve(
      this.actorAuthorizations.get(resourceKey(deploymentId, actorRef)),
    );
  }

  listTransferAttestations(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestation[]> {
    return Promise.resolve(
      this.transferAttestations.filter(
        (item) =>
          item.deploymentId === deploymentId && item.threadId === threadId,
      ),
    );
  }

  listTransferAttestationControls(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly TransferAttestationControl[]> {
    return Promise.resolve(
      this.transferAttestationControls.filter(
        (item) =>
          item.deploymentId === deploymentId && item.threadId === threadId,
      ),
    );
  }

  listAuditEvents(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): readonly AuditEvent[] {
    return this.auditEvents.filter(
      (item) =>
        item.deploymentId === deploymentId && item.threadId === threadId,
    );
  }

  failNextCommit(): void {
    this.failNextCommitRequested = true;
  }

  commit(mutation: WorkflowMutation): Promise<void> {
    try {
      this.commitSynchronously(mutation);
      return Promise.resolve();
    } catch (error: unknown) {
      return Promise.reject(error);
    }
  }

  private commitSynchronously(mutation: WorkflowMutation): void {
    const nextThreads = new Map(this.threads);
    const nextAuditEvents = [...this.auditEvents];
    const nextAttestations = [...this.transferAttestations];
    const nextControls = [...this.transferAttestationControls];

    this.validateMutationScope(mutation);

    if (mutation.nextThread !== undefined) {
      const key = resourceKey(mutation.deploymentId, mutation.threadId);
      const current = nextThreads.get(key);
      if (current === undefined) {
        throw new Error("Authoritative thread is missing during commit.");
      }
      if (
        mutation.expectedThreadVersion === undefined ||
        current.version !== mutation.expectedThreadVersion
      ) {
        throw new DomainError(
          "STALE_VERSION",
          "Thread version changed before the transaction committed.",
        );
      }
      if (mutation.nextThread.version !== current.version + 1) {
        throw new Error("Next thread version must increment exactly once.");
      }
      nextThreads.set(key, mutation.nextThread);
    }

    for (const attestation of mutation.transferAttestations ?? []) {
      if (
        nextAttestations.some(
          (item) =>
            item.deploymentId === attestation.deploymentId &&
            item.attestationId === attestation.attestationId,
        )
      ) {
        throw new Error("Transfer attestation identifier already exists.");
      }
      nextAttestations.push(attestation);
    }

    for (const control of mutation.transferAttestationControls ?? []) {
      this.validateControl(control, nextAttestations, nextControls);
      nextControls.push(control);
    }

    for (const event of mutation.auditEvents ?? []) {
      if (
        nextAuditEvents.some(
          (item) =>
            item.deploymentId === event.deploymentId &&
            item.eventId === event.eventId,
        )
      ) {
        throw new Error("Audit event identifier already exists.");
      }
      nextAuditEvents.push(event);
    }

    if (this.failNextCommitRequested) {
      this.failNextCommitRequested = false;
      throw new Error("Synthetic transaction failure.");
    }

    this.threads = nextThreads;
    this.auditEvents = nextAuditEvents;
    this.transferAttestations = nextAttestations;
    this.transferAttestationControls = nextControls;
  }

  private validateMutationScope(mutation: WorkflowMutation): void {
    if (
      mutation.nextThread !== undefined &&
      (mutation.nextThread.deploymentId !== mutation.deploymentId ||
        mutation.nextThread.threadId !== mutation.threadId)
    ) {
      throw new Error("Thread mutation escaped its authoritative scope.");
    }

    for (const item of mutation.transferAttestations ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error(
          "Attestation mutation escaped its authoritative scope.",
        );
      }
    }

    for (const item of mutation.transferAttestationControls ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error("Attestation control escaped its authoritative scope.");
      }
    }

    for (const item of mutation.auditEvents ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error("Audit mutation escaped its authoritative scope.");
      }
    }
  }

  private validateControl(
    control: TransferAttestationControl,
    attestations: readonly TransferAttestation[],
    controls: readonly TransferAttestationControl[],
  ): void {
    const target = attestations.find(
      (item) =>
        item.deploymentId === control.deploymentId &&
        item.threadId === control.threadId &&
        item.attestationId === control.targetAttestationId,
    );
    if (target === undefined) {
      throw new DomainError(
        "INVALID_ATTESTATION_CONTROL",
        "Attestation control target does not exist in the authoritative scope.",
      );
    }

    if (
      controls.some(
        (item) =>
          item.deploymentId === control.deploymentId &&
          item.threadId === control.threadId &&
          item.targetAttestationId === control.targetAttestationId,
      )
    ) {
      throw new DomainError(
        "INVALID_ATTESTATION_CONTROL",
        "Attestation is already superseded or invalidated.",
      );
    }

    if (control.action === "SUPERSEDE") {
      if (
        control.replacementAttestationId === undefined ||
        control.replacementAttestationId === control.targetAttestationId
      ) {
        throw new DomainError(
          "INVALID_ATTESTATION_CONTROL",
          "Supersession requires a distinct replacement attestation.",
        );
      }
      const replacement = attestations.find(
        (item) =>
          item.deploymentId === control.deploymentId &&
          item.threadId === control.threadId &&
          item.attestationId === control.replacementAttestationId,
      );
      if (replacement === undefined) {
        throw new DomainError(
          "INVALID_ATTESTATION_CONTROL",
          "Supersession replacement does not exist in the authoritative scope.",
        );
      }
    } else if (control.replacementAttestationId !== undefined) {
      throw new DomainError(
        "INVALID_ATTESTATION_CONTROL",
        "Invalidation must not specify a replacement attestation.",
      );
    }
  }
}
