import {
  DomainError,
  applyAttachmentScanResult,
  normalizeDeclaredAttachmentMetadata,
  type ActorAuthorization,
  type ActorContext,
  type ActorRef,
  type Attachment,
  type AttachmentId,
  type AttachmentMediaCategory,
  type AttachmentSafetyState,
  type AttachmentScanOutcome,
  type AuditEvent,
  type DeploymentId,
  type Message,
  type MessageId,
  type Thread,
  type ThreadId,
  type WorkflowPermission,
} from "../domain/index.js";
import {
  resolveAuthorizedAttachment,
  retrieveAuthorizedAttachment,
  type AuthorizedAttachmentResolutionResult,
  type AuthorizedAttachmentRetrievalResult,
} from "./attachment-retrieval.js";
import { ApplicationError } from "./errors.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { ProtectedContentStore } from "./protected-content.js";
import type { WorkflowStore } from "./ports.js";

export interface IngestAttachmentInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly originalDisplayFilename: string;
  readonly declaredMediaCategory: AttachmentMediaCategory;
  readonly declaredMediaType: string;
  readonly content: Uint8Array;
  readonly at: string;
}

export interface RecordAttachmentScanResultInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
  readonly scanResultRef: string;
  readonly outcome: AttachmentScanOutcome;
  readonly at: string;
}

export interface RetrieveAttachmentInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
  readonly at: string;
}

export interface PreviewStaffAttachmentInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
}

export interface ListStaffAttachmentCandidatesInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
}

export interface StaffAttachmentCandidate {
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
  readonly safeDownloadFilename: string;
  readonly normalizedMediaType: string;
  readonly normalizedMediaCategory: AttachmentMediaCategory;
  readonly byteLength: number;
  readonly safetyState: AttachmentSafetyState;
}

export type AttachmentRetrievalResult = AuthorizedAttachmentRetrievalResult;
export type AttachmentPreviewResult = AuthorizedAttachmentResolutionResult;

interface AuthorizedThread {
  readonly thread: Thread;
  readonly authorization: ActorAuthorization;
}

export class AttachmentService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly contentStore: ProtectedContentStore,
    private readonly idGenerator: OpaqueIdGenerator,
    private readonly systemActorRef: ActorRef,
  ) {}

  async ingestAttachment(input: IngestAttachmentInput): Promise<Attachment> {
    await this.loadAuthoritativeMessage(
      input.deploymentId,
      input.threadId,
      input.messageId,
    );
    const policy = await this.store.getCurrentAttachmentFilePolicy(
      input.deploymentId,
    );
    if (policy?.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "ATTACHMENT_POLICY_NOT_FOUND",
        "Current attachment policy is unavailable for the deployment.",
      );
    }

    const currentAttachments = await this.store.listAttachmentsForMessage(
      input.deploymentId,
      input.threadId,
      input.messageId,
    );
    if (currentAttachments.length >= policy.maxAttachmentsPerMessage) {
      throw new ApplicationError(
        "ATTACHMENT_POLICY_REJECTED",
        "Attachment count exceeds the configured policy.",
      );
    }

    const metadata = normalizeDeclaredAttachmentMetadata(
      {
        originalDisplayFilename: input.originalDisplayFilename,
        declaredMediaCategory: input.declaredMediaCategory,
        declaredMediaType: input.declaredMediaType,
        sizeBytes: input.content.byteLength,
      },
      policy,
    );
    const attachmentId = this.idGenerator.generate("attachment");
    const contentRef = this.idGenerator.generate("content");
    const attachment: Attachment = {
      attachmentId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      messageId: input.messageId,
      ...metadata,
      contentRef,
      state: "QUARANTINED",
      createdAt: input.at,
      version: 1,
    };

    try {
      await this.contentStore.put(contentRef, input.content);
    } catch {
      throw new ApplicationError(
        "CONTENT_STORAGE_FAILED",
        "Protected attachment content could not be staged.",
      );
    }

    try {
      await this.store.commit({
        deploymentId: input.deploymentId,
        threadId: input.threadId,
        newAttachments: [attachment],
        attachmentCountGuards: [
          {
            messageId: input.messageId,
            attachmentPolicyRef: policy.policyRef,
          },
        ],
        auditEvents: [
          this.systemAudit(
            attachment,
            "ATTACHMENT_REGISTERED",
            input.at,
            "QUARANTINED",
          ),
          this.systemAudit(
            attachment,
            "ATTACHMENT_QUARANTINED",
            input.at,
            "QUARANTINED",
          ),
        ],
      });
    } catch (error: unknown) {
      try {
        await this.contentStore.delete(contentRef);
      } catch {
        throw new ApplicationError(
          "ATTACHMENT_PUBLICATION_FAILED",
          "Attachment metadata publication failed and staged-content cleanup could not be confirmed.",
        );
      }
      if (
        error instanceof DomainError &&
        (error.code === "ATTACHMENT_COUNT_LIMIT_EXCEEDED" ||
          error.code === "STALE_ATTACHMENT_POLICY")
      ) {
        throw new ApplicationError(
          "ATTACHMENT_POLICY_REJECTED",
          "Attachment publication no longer satisfies the authoritative policy.",
        );
      }
      throw new ApplicationError(
        "ATTACHMENT_PUBLICATION_FAILED",
        "Attachment metadata publication failed; staged content was removed.",
      );
    }

    return attachment;
  }

  async recordScanResult(
    input: RecordAttachmentScanResultInput,
  ): Promise<Attachment> {
    await this.loadAuthoritativeMessage(
      input.deploymentId,
      input.threadId,
      input.messageId,
    );
    const attachment = await this.loadAttachmentInScope(
      input.deploymentId,
      input.threadId,
      input.messageId,
      input.attachmentId,
    );
    const nextAttachment = applyAttachmentScanResult(
      attachment,
      input.scanResultRef,
      input.outcome,
      input.at,
    );
    if (nextAttachment === attachment) {
      return attachment;
    }

    const auditEvents: AuditEvent[] = [];
    if (input.outcome === "INDETERMINATE") {
      auditEvents.push(
        this.systemAudit(
          nextAttachment,
          "ATTACHMENT_SCAN_INDETERMINATE",
          input.at,
          nextAttachment.state,
          input.outcome,
        ),
      );
    } else {
      auditEvents.push(
        this.systemAudit(
          nextAttachment,
          "ATTACHMENT_SCAN_ACCEPTED",
          input.at,
          nextAttachment.state,
          input.outcome,
        ),
      );
      if (input.outcome === "MALICIOUS") {
        auditEvents.push(
          this.systemAudit(
            nextAttachment,
            "ATTACHMENT_REJECTED",
            input.at,
            "REJECTED",
            input.outcome,
          ),
        );
      }
    }

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      attachmentUpdates: [
        {
          expectedVersion: attachment.version,
          attachment: nextAttachment,
        },
      ],
      auditEvents,
    });

    return nextAttachment;
  }

  async listStaffAttachmentCandidates(
    input: ListStaffAttachmentCandidatesInput,
  ): Promise<readonly StaffAttachmentCandidate[]> {
    const { authorization } = await this.loadAuthorizedThread(
      input,
      "ATTACHMENT_READ",
    );
    this.requireStaffAuthorization(authorization);

    const messages = await this.store.listMessages(
      input.deploymentId,
      input.threadId,
    );
    const candidates: StaffAttachmentCandidate[] = [];

    for (const message of messages) {
      if (
        message.deploymentId !== input.deploymentId ||
        message.threadId !== input.threadId
      ) {
        throw new ApplicationError(
          "RESOURCE_NOT_FOUND",
          "Authoritative message was not found in the requested thread.",
        );
      }
      const attachments = await this.store.listAttachmentsForMessage(
        input.deploymentId,
        input.threadId,
        message.messageId,
      );
      for (const attachment of attachments) {
        if (
          attachment.deploymentId !== input.deploymentId ||
          attachment.threadId !== input.threadId ||
          attachment.messageId !== message.messageId
        ) {
          throw new ApplicationError(
            "ATTACHMENT_NOT_FOUND",
            "Authoritative attachment was not found in the requested scope.",
          );
        }
        candidates.push({
          messageId: message.messageId,
          attachmentId: attachment.attachmentId,
          safeDownloadFilename: attachment.safeDownloadFilename,
          normalizedMediaType: attachment.normalizedMediaType,
          normalizedMediaCategory: attachment.normalizedMediaCategory,
          byteLength: attachment.sizeBytes,
          safetyState: attachment.state,
        });
      }
    }

    return candidates.sort(
      (left, right) =>
        left.messageId.localeCompare(right.messageId) ||
        left.attachmentId.localeCompare(right.attachmentId),
    );
  }

  async previewStaffAttachment(
    input: PreviewStaffAttachmentInput,
  ): Promise<AttachmentPreviewResult> {
    const { authorization } = await this.loadAuthorizedThread(
      input,
      "ATTACHMENT_READ",
    );
    this.requireStaffAuthorization(authorization);

    return resolveAuthorizedAttachment(
      { store: this.store, contentStore: this.contentStore },
      input,
    );
  }

  async retrieveStaffAttachment(
    input: RetrieveAttachmentInput,
  ): Promise<AttachmentRetrievalResult> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "ATTACHMENT_READ",
    );
    this.requireStaffAuthorization(authorization);

    return retrieveAuthorizedAttachment(
      {
        store: this.store,
        contentStore: this.contentStore,
        idGenerator: this.idGenerator,
      },
      {
        deploymentId: input.deploymentId,
        threadId: input.threadId,
        messageId: input.messageId,
        attachmentId: input.attachmentId,
        at: input.at,
        expectedThreadVersion: thread.version,
        authority: {
          actorRef: authorization.actorRef,
          actorKind: authorization.actorKind,
        },
      },
    );
  }

  private async loadAuthoritativeMessage(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
  ): Promise<Message> {
    const thread = await this.store.getThread(deploymentId, threadId);
    if (thread?.deploymentId !== deploymentId) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Authoritative thread was not found in the requested deployment.",
      );
    }
    const message = await this.store.getMessage(
      deploymentId,
      threadId,
      messageId,
    );
    if (
      message?.deploymentId !== deploymentId ||
      message?.threadId !== threadId
    ) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Authoritative message was not found in the requested thread.",
      );
    }
    return message;
  }

  private async loadAttachmentInScope(
    deploymentId: DeploymentId,
    threadId: ThreadId,
    messageId: MessageId,
    attachmentId: AttachmentId,
  ): Promise<Attachment> {
    const attachment = await this.store.getAttachment(
      deploymentId,
      attachmentId,
    );
    if (
      attachment?.deploymentId !== deploymentId ||
      attachment?.threadId !== threadId ||
      attachment?.messageId !== messageId
    ) {
      throw new ApplicationError(
        "ATTACHMENT_NOT_FOUND",
        "Authoritative attachment was not found in the requested scope.",
      );
    }
    return attachment;
  }

  private async loadAuthorizedThread(
    input: {
      readonly actor: ActorContext;
      readonly deploymentId: DeploymentId;
      readonly threadId: ThreadId;
    },
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
    if (thread?.deploymentId !== input.deploymentId) {
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
      authorization?.active !== true ||
      authorization.deploymentId !== input.deploymentId ||
      authorization.actorKind !== input.actor.actorKind ||
      !authorization.allowedQueueIds.includes(thread.queueId) ||
      !authorization.permissions.includes(permission)
    ) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor is not authorized for this authoritative attachment action.",
      );
    }

    return { thread, authorization };
  }

  private requireStaffAuthorization(authorization: ActorAuthorization): void {
    if (authorization.actorKind !== "STAFF") {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Attachment access requires an authenticated staff actor.",
      );
    }
  }

  private systemAudit(
    attachment: Attachment,
    eventType: AuditEvent["eventType"],
    at: string,
    attachmentState: Attachment["state"],
    scanOutcome?: AttachmentScanOutcome,
  ): AuditEvent {
    return {
      eventId: this.idGenerator.generate("audit"),
      deploymentId: attachment.deploymentId,
      threadId: attachment.threadId,
      eventType,
      actorRef: this.systemActorRef,
      actorKind: "SYSTEM",
      at,
      attachmentId: attachment.attachmentId,
      attachmentState,
      ...(scanOutcome === undefined ? {} : { scanOutcome }),
      outcome: "SUCCEEDED",
    };
  }
}
