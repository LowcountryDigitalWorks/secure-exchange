import { DomainError } from "../domain/errors.js";
import {
  validateQueue,
  type ActorAuthorization,
  type ActorRef,
  type AuditEvent,
  type CompletionPolicy,
  type DeploymentId,
  type Message,
  type Queue,
  type QueueId,
  type Thread,
  type ThreadId,
  type TransferAttestation,
  type TransferAttestationControl,
} from "../domain/index.js";
import type { WorkflowMutation, WorkflowStore } from "../application/ports.js";

export interface InMemoryWorkflowSeed {
  readonly queues?: readonly Queue[];
  readonly threads?: readonly Thread[];
  readonly messages?: readonly Message[];
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
  private queues: Map<string, Queue>;
  private threads: Map<string, Thread>;
  private messages: Message[];
  private completionPolicies: Map<string, CompletionPolicy>;
  private actorAuthorizations: Map<string, ActorAuthorization>;
  private auditEvents: AuditEvent[];
  private transferAttestations: TransferAttestation[];
  private transferAttestationControls: TransferAttestationControl[];
  private failNextCommitRequested = false;

  constructor(seed: InMemoryWorkflowSeed = {}) {
    this.queues = new Map(
      (seed.queues ?? []).map((queue) => {
        const validated = validateQueue(queue);
        return [
          resourceKey(validated.deploymentId, validated.queueId),
          validated,
        ];
      }),
    );
    this.threads = new Map(
      (seed.threads ?? []).map((thread) => [
        resourceKey(thread.deploymentId, thread.threadId),
        thread,
      ]),
    );
    this.messages = [...(seed.messages ?? [])];
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

  getQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<Queue | undefined> {
    return Promise.resolve(this.queues.get(resourceKey(deploymentId, queueId)));
  }

  getThread(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<Thread | undefined> {
    return Promise.resolve(
      this.threads.get(resourceKey(deploymentId, threadId)),
    );
  }

  listThreadsForQueue(
    deploymentId: DeploymentId,
    queueId: QueueId,
  ): Promise<readonly Thread[]> {
    return Promise.resolve(
      [...this.threads.values()].filter(
        (thread) =>
          thread.deploymentId === deploymentId && thread.queueId === queueId,
      ),
    );
  }

  listMessages(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<readonly Message[]> {
    return Promise.resolve(
      this.messages
        .filter(
          (message) =>
            message.deploymentId === deploymentId &&
            message.threadId === threadId,
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.messageId.localeCompare(right.messageId),
        ),
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
    return Promise.resolve().then(() => {
      this.commitSynchronously(mutation);
    });
  }

  private commitSynchronously(mutation: WorkflowMutation): void {
    const nextThreads = new Map(this.threads);
    const nextMessages = [...this.messages];
    const nextAuditEvents = [...this.auditEvents];
    const nextAttestations = [...this.transferAttestations];
    const nextControls = [...this.transferAttestationControls];

    this.validateMutationScope(mutation);

    if (mutation.newThread !== undefined && mutation.nextThread !== undefined) {
      throw new Error(
        "A transaction cannot create and update the same thread.",
      );
    }

    if (mutation.newThread !== undefined) {
      const key = resourceKey(mutation.deploymentId, mutation.threadId);
      if (nextThreads.has(key)) {
        throw new Error("Thread identifier already exists.");
      }
      if (mutation.newThread.version !== 1) {
        throw new Error("A newly created thread must start at version 1.");
      }
      nextThreads.set(key, mutation.newThread);
    }

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

    if (
      !nextThreads.has(resourceKey(mutation.deploymentId, mutation.threadId))
    ) {
      throw new Error("Mutation requires an authoritative thread.");
    }

    for (const message of mutation.messages ?? []) {
      if (
        nextMessages.some(
          (item) =>
            item.deploymentId === message.deploymentId &&
            item.messageId === message.messageId,
        )
      ) {
        throw new Error("Message identifier already exists.");
      }
      nextMessages.push(message);
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
    this.messages = nextMessages;
    this.auditEvents = nextAuditEvents;
    this.transferAttestations = nextAttestations;
    this.transferAttestationControls = nextControls;
  }

  private validateMutationScope(mutation: WorkflowMutation): void {
    for (const thread of [mutation.newThread, mutation.nextThread]) {
      if (
        thread !== undefined &&
        (thread.deploymentId !== mutation.deploymentId ||
          thread.threadId !== mutation.threadId)
      ) {
        throw new Error("Thread mutation escaped its authoritative scope.");
      }
    }

    for (const item of mutation.messages ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error("Message mutation escaped its authoritative scope.");
      }
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
