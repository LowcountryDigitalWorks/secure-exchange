import { DomainError } from "../domain/errors.js";
import {
  validateAccessGrant,
  validateAccessGrantPolicy,
  validateAttachment,
  validateAttachmentFilePolicy,
  validateQueue,
  type AccessGrant,
  type AccessGrantId,
  type AccessGrantPolicy,
  type ActorAuthorization,
  type Attachment,
  type AttachmentFilePolicy,
  type AttachmentId,
  type ActorRef,
  type AuditEvent,
  type CompletionPolicy,
  type DeploymentId,
  type Message,
  type MessageId,
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
  readonly attachments?: readonly Attachment[];
  readonly attachmentPolicies?: readonly AttachmentFilePolicy[];
  readonly accessGrants?: readonly AccessGrant[];
  readonly accessGrantPolicies?: readonly AccessGrantPolicy[];
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
  private attachments: Map<string, Attachment>;
  private attachmentPolicies: Map<string, AttachmentFilePolicy>;
  private accessGrants: Map<string, AccessGrant>;
  private accessGrantPolicies: Map<string, AccessGrantPolicy>;
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
    this.attachments = new Map(
      (seed.attachments ?? []).map((attachment) => {
        const validated = validateAttachment(attachment);
        return [
          resourceKey(validated.deploymentId, validated.attachmentId),
          validated,
        ];
      }),
    );
    this.attachmentPolicies = new Map(
      (seed.attachmentPolicies ?? []).map((policy) => {
        const validated = validateAttachmentFilePolicy(policy);
        return [validated.deploymentId, validated];
      }),
    );
    this.accessGrants = new Map(
      (seed.accessGrants ?? []).map((grant) => {
        const validated = validateAccessGrant(grant);
        return [
          resourceKey(validated.deploymentId, validated.grantId),
          validated,
        ];
      }),
    );
    this.accessGrantPolicies = new Map(
      (seed.accessGrantPolicies ?? []).map((policy) => {
        const validated = validateAccessGrantPolicy(policy);
        return [validated.deploymentId, validated];
      }),
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

  getMessage(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
  ): Promise<Message | undefined> {
    return Promise.resolve(
      this.messages.find(
        (message) =>
          message.deploymentId === deploymentId &&
          message.threadId === threadId &&
          message.messageId === messageId,
      ),
    );
  }

  getAttachment(
    deploymentId: DeploymentId,
    attachmentId: AttachmentId,
  ): Promise<Attachment | undefined> {
    return Promise.resolve(
      this.attachments.get(resourceKey(deploymentId, attachmentId)),
    );
  }

  listAttachmentsForMessage(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
  ): Promise<readonly Attachment[]> {
    return Promise.resolve(
      [...this.attachments.values()].filter(
        (attachment) =>
          attachment.deploymentId === deploymentId &&
          attachment.threadId === threadId &&
          attachment.messageId === messageId,
      ),
    );
  }

  getCurrentAttachmentFilePolicy(
    deploymentId: DeploymentId,
  ): Promise<AttachmentFilePolicy | undefined> {
    return Promise.resolve(this.attachmentPolicies.get(deploymentId));
  }

  getAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<AccessGrant | undefined> {
    return Promise.resolve(
      this.accessGrants.get(resourceKey(deploymentId, accessGrantId)),
    );
  }

  getCurrentAccessGrantPolicy(
    deploymentId: DeploymentId,
  ): Promise<AccessGrantPolicy | undefined> {
    return Promise.resolve(this.accessGrantPolicies.get(deploymentId));
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
    const nextAttachments = new Map(this.attachments);
    const nextAccessGrants = new Map(this.accessGrants);
    const nextAuditEvents = [...this.auditEvents];
    const nextAttestations = [...this.transferAttestations];
    const nextControls = [...this.transferAttestationControls];

    this.validateMutationScope(mutation);
    this.validateAccessGrantAuthorityGuards(mutation, nextAccessGrants);

    if (mutation.newThread !== undefined && mutation.nextThread !== undefined) {
      throw new Error(
        "A transaction cannot create and update the same thread.",
      );
    }

    const threadKey = resourceKey(mutation.deploymentId, mutation.threadId);
    if (mutation.expectedThreadVersion !== undefined) {
      const current = nextThreads.get(threadKey);
      if (current?.version !== mutation.expectedThreadVersion) {
        throw new DomainError(
          "STALE_VERSION",
          "Thread version changed before the transaction committed.",
        );
      }
    }

    if (mutation.newThread !== undefined) {
      if (nextThreads.has(threadKey)) {
        throw new Error("Thread identifier already exists.");
      }
      if (mutation.newThread.version !== 1) {
        throw new Error("A newly created thread must start at version 1.");
      }
      nextThreads.set(threadKey, mutation.newThread);
    }

    if (mutation.nextThread !== undefined) {
      const current = nextThreads.get(threadKey);
      if (current === undefined) {
        throw new Error("Authoritative thread is missing during commit.");
      }
      if (mutation.expectedThreadVersion === undefined) {
        throw new Error("Thread update requires an expected version.");
      }
      if (mutation.nextThread.version !== current.version + 1) {
        throw new Error("Next thread version must increment exactly once.");
      }
      nextThreads.set(threadKey, mutation.nextThread);
    }

    if (!nextThreads.has(threadKey)) {
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

    for (const attachment of mutation.newAttachments ?? []) {
      const key = resourceKey(attachment.deploymentId, attachment.attachmentId);
      if (nextAttachments.has(key)) {
        throw new Error("Attachment identifier already exists.");
      }
      if (attachment.version !== 1) {
        throw new Error(
          "A newly published attachment must start at version 1.",
        );
      }
      nextAttachments.set(key, validateAttachment(attachment));
    }

    this.validateAttachmentCountGuards(mutation, nextAttachments, nextMessages);

    for (const update of mutation.attachmentUpdates ?? []) {
      const attachment = validateAttachment(update.attachment);
      const key = resourceKey(attachment.deploymentId, attachment.attachmentId);
      const current = nextAttachments.get(key);
      if (current === undefined) {
        throw new Error("Authoritative attachment is missing during commit.");
      }
      if (current.version !== update.expectedVersion) {
        throw new DomainError(
          "STALE_VERSION",
          "Attachment version changed before the transaction committed.",
        );
      }
      if (attachment.version !== current.version + 1) {
        throw new Error("Next attachment version must increment exactly once.");
      }
      nextAttachments.set(key, attachment);
    }

    for (const grant of mutation.newAccessGrants ?? []) {
      const validated = validateAccessGrant(grant);
      const key = resourceKey(validated.deploymentId, validated.grantId);
      if (nextAccessGrants.has(key)) {
        throw new Error("AccessGrant identifier already exists.");
      }
      if (validated.version !== 1) {
        throw new Error("A newly issued AccessGrant must start at version 1.");
      }
      this.validateNewAccessGrantPolicy(validated);
      nextAccessGrants.set(key, validated);
    }

    for (const update of mutation.accessGrantUpdates ?? []) {
      const grant = validateAccessGrant(update.accessGrant);
      const key = resourceKey(grant.deploymentId, grant.grantId);
      const current = nextAccessGrants.get(key);
      if (current === undefined) {
        throw new Error("Authoritative AccessGrant is missing during commit.");
      }
      if (current.version !== update.expectedVersion) {
        throw new DomainError(
          "STALE_VERSION",
          "AccessGrant version changed before the transaction committed.",
        );
      }
      if (grant.version !== current.version + 1) {
        throw new Error(
          "Next AccessGrant version must increment exactly once.",
        );
      }
      if (
        grant.deploymentId !== current.deploymentId ||
        grant.threadId !== current.threadId ||
        grant.externalParticipantRef !== current.externalParticipantRef ||
        grant.policyRef !== current.policyRef ||
        grant.verifierDigest !== current.verifierDigest ||
        grant.issuedAt !== current.issuedAt ||
        grant.expiresAt !== current.expiresAt ||
        JSON.stringify(grant.permittedOperations) !==
          JSON.stringify(current.permittedOperations)
      ) {
        throw new Error(
          "AccessGrant revocation update changed immutable authority metadata.",
        );
      }
      nextAccessGrants.set(key, grant);
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
    this.attachments = nextAttachments;
    this.accessGrants = nextAccessGrants;
    this.auditEvents = nextAuditEvents;
    this.transferAttestations = nextAttestations;
    this.transferAttestationControls = nextControls;
  }

  private validateAccessGrantAuthorityGuards(
    mutation: WorkflowMutation,
    accessGrants: ReadonlyMap<string, AccessGrant>,
  ): void {
    const guardedGrantIds = new Set<AccessGrantId>();
    for (const guard of mutation.accessGrantAuthorityGuards ?? []) {
      if (guardedGrantIds.has(guard.grantId)) {
        throw new Error("AccessGrant authority guard is duplicated.");
      }
      guardedGrantIds.add(guard.grantId);

      const current = accessGrants.get(
        resourceKey(guard.deploymentId, guard.grantId),
      );
      const validAt = Date.parse(guard.validAt);
      if (
        current?.deploymentId !== guard.deploymentId ||
        current.threadId !== guard.threadId ||
        !Number.isSafeInteger(guard.expectedVersion) ||
        guard.expectedVersion <= 0 ||
        current.version !== guard.expectedVersion ||
        current.revokedAt !== undefined ||
        !current.permittedOperations.includes(guard.requiredOperation) ||
        !Number.isFinite(validAt) ||
        validAt < Date.parse(current.issuedAt) ||
        validAt >= Date.parse(current.expiresAt)
      ) {
        throw new DomainError(
          "ACCESS_GRANT_AUTHORITY_CHANGED",
          "AccessGrant authority is no longer valid for the transaction.",
        );
      }
    }
  }

  private validateAttachmentCountGuards(
    mutation: WorkflowMutation,
    attachments: ReadonlyMap<string, Attachment>,
    messages: readonly Message[],
  ): void {
    const newAttachments = mutation.newAttachments ?? [];
    const guards = mutation.attachmentCountGuards ?? [];
    if (newAttachments.length === 0 && guards.length === 0) {
      return;
    }

    const guardMessages = new Set<MessageId>();
    for (const guard of guards) {
      if (guardMessages.has(guard.messageId)) {
        throw new Error("Attachment count guard is duplicated for a message.");
      }
      guardMessages.add(guard.messageId);
    }

    for (const attachment of newAttachments) {
      const guard = guards.find(
        (candidate) => candidate.messageId === attachment.messageId,
      );
      if (guard === undefined) {
        throw new Error(
          "New attachment publication requires an authoritative count guard.",
        );
      }
      const messageExists = messages.some(
        (message) =>
          message.deploymentId === mutation.deploymentId &&
          message.threadId === mutation.threadId &&
          message.messageId === attachment.messageId,
      );
      if (!messageExists) {
        throw new Error(
          "Attachment count guard requires an authoritative message.",
        );
      }
      const policy = this.attachmentPolicies.get(mutation.deploymentId);
      if (policy?.policyRef !== guard.attachmentPolicyRef) {
        throw new DomainError(
          "STALE_ATTACHMENT_POLICY",
          "Attachment policy changed before publication committed.",
        );
      }
      const count = [...attachments.values()].filter(
        (item) =>
          item.deploymentId === mutation.deploymentId &&
          item.threadId === mutation.threadId &&
          item.messageId === attachment.messageId,
      ).length;
      if (count > policy.maxAttachmentsPerMessage) {
        throw new DomainError(
          "ATTACHMENT_COUNT_LIMIT_EXCEEDED",
          "Authoritative attachment count exceeds the configured policy.",
        );
      }
    }
  }

  private validateNewAccessGrantPolicy(grant: AccessGrant): void {
    const policy = this.accessGrantPolicies.get(grant.deploymentId);
    if (policy?.policyRef !== grant.policyRef) {
      throw new DomainError(
        "INVALID_ACCESS_GRANT_POLICY",
        "AccessGrant policy changed before issuance committed.",
      );
    }
    validateAccessGrantPolicy(policy);
    const lifetimeSeconds =
      (Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt)) / 1_000;
    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds > policy.maxLifetimeSeconds ||
      grant.permittedOperations.some(
        (operation) => !policy.allowedOperations.includes(operation),
      )
    ) {
      throw new DomainError(
        "INVALID_ACCESS_GRANT_POLICY",
        "AccessGrant authority is outside the authoritative policy.",
      );
    }
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

    for (const item of mutation.newAttachments ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error("Attachment mutation escaped its authoritative scope.");
      }
    }

    for (const update of mutation.attachmentUpdates ?? []) {
      if (
        update.attachment.deploymentId !== mutation.deploymentId ||
        update.attachment.threadId !== mutation.threadId
      ) {
        throw new Error("Attachment update escaped its authoritative scope.");
      }
    }

    for (const item of mutation.newAccessGrants ?? []) {
      if (
        item.deploymentId !== mutation.deploymentId ||
        item.threadId !== mutation.threadId
      ) {
        throw new Error(
          "AccessGrant mutation escaped its authoritative scope.",
        );
      }
    }

    for (const update of mutation.accessGrantUpdates ?? []) {
      if (
        update.accessGrant.deploymentId !== mutation.deploymentId ||
        update.accessGrant.threadId !== mutation.threadId
      ) {
        throw new Error("AccessGrant update escaped its authoritative scope.");
      }
    }

    for (const guard of mutation.accessGrantAuthorityGuards ?? []) {
      if (
        guard.deploymentId !== mutation.deploymentId ||
        guard.threadId !== mutation.threadId
      ) {
        throw new Error(
          "AccessGrant authority guard escaped its authoritative scope.",
        );
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
