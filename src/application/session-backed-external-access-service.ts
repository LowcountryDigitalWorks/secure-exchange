import {
  createPlainTextMessageBody,
  isBrowserSessionActiveAt,
  isExternalAccessThreadEligible,
  isExternalReplyAllowed,
  recordExternalThreadActivity,
  validateAccessGrant,
  validateBrowserSession,
  type AccessGrant,
  type AccessGrantOperation,
  type AttachmentId,
  type ExternalParticipantRef,
  type Message,
  type MessageId,
  type Thread,
} from "../domain/index.js";
import type { Clock } from "./clock.js";
import { ApplicationError } from "./errors.js";
import type { ExternalSessionStore } from "./external-session-store.js";
import {
  isValidatedBrowserSessionBinding,
  type ValidatedBrowserSessionBinding,
} from "./external-session-service.js";
import { retrieveAuthorizedAttachment } from "./attachment-retrieval.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { WorkflowStore } from "./ports.js";
import type { ProtectedContentStore } from "./protected-content.js";

export interface ValidatedSessionExternalAuthority {
  readonly grantId: string;
  readonly deploymentId: string;
  readonly threadId: string;
  readonly externalParticipantRef: ExternalParticipantRef;
  readonly operation: AccessGrantOperation;
  readonly accessGrantVersion: number;
  readonly threadVersion: number;
  readonly sessionId: string;
  readonly sessionVersion: number;
}

export interface SessionExternalConversationMessage {
  readonly direction: "EXTERNAL_TO_STAFF" | "STAFF_TO_EXTERNAL";
  readonly createdAt: string;
  readonly body: {
    readonly kind: "PLAIN_TEXT";
    readonly text: string;
  };
}

export interface SessionExternalConversationProjection {
  readonly threadId: string;
  readonly messages: readonly SessionExternalConversationMessage[];
}

export interface SessionExternalReplyReceipt {
  readonly threadId: string;
  readonly createdAt: string;
}

export interface SessionExternalAttachmentCandidate {
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
  readonly safeDownloadFilename: string;
  readonly normalizedMediaType: string;
  readonly byteLength: number;
}

export interface SessionExternalAttachmentRetrievalResult {
  readonly safeDownloadFilename: string;
  readonly normalizedMediaType: string;
  readonly byteLength: number;
  readonly content: Uint8Array;
}

interface ValidatedGrantRecord {
  readonly grant: AccessGrant;
  readonly thread: Thread;
  readonly authority: ValidatedSessionExternalAuthority;
}

export class SessionBackedExternalAccessService {
  constructor(
    private readonly workflowStore: WorkflowStore,
    private readonly sessionStore: ExternalSessionStore,
    private readonly contentStore: ProtectedContentStore,
    private readonly idGenerator: OpaqueIdGenerator,
    private readonly clock: Clock,
  ) {}

  async validateOperation(
    binding: ValidatedBrowserSessionBinding,
    operation: AccessGrantOperation,
  ): Promise<ValidatedSessionExternalAuthority> {
    const record = await this.validateGrantRecord(binding, operation);
    return record.authority;
  }

  async retrieveExternalConversation(
    binding: ValidatedBrowserSessionBinding,
  ): Promise<SessionExternalConversationProjection> {
    const { authority } = await this.validateGrantRecord(
      binding,
      "THREAD_READ",
    );
    const messages = await this.workflowStore.listMessages(
      authority.deploymentId,
      authority.threadId,
    );
    await this.requireSessionBindingCurrent(binding, this.currentTime());
    await this.workflowStore.commit({
      deploymentId: authority.deploymentId,
      threadId: authority.threadId,
      expectedThreadVersion: authority.threadVersion,
      auditEvents: [
        {
          eventId: this.idGenerator.generate("audit"),
          deploymentId: authority.deploymentId,
          threadId: authority.threadId,
          eventType: "EXTERNAL_THREAD_RETRIEVED",
          actorRef: authority.externalParticipantRef,
          actorKind: "EXTERNAL",
          at: this.currentTime(),
          accessGrantId: authority.grantId,
          outcome: "SUCCEEDED",
        },
      ],
    });
    return {
      threadId: authority.threadId,
      messages: messages.map((message) => ({
        direction: message.direction,
        createdAt: message.createdAt,
        body: {
          kind: message.body.kind,
          text: message.body.text,
        },
      })),
    };
  }

  async replyExternalConversation(
    binding: ValidatedBrowserSessionBinding,
    messageBody: string,
  ): Promise<SessionExternalReplyReceipt> {
    const { grant, thread, authority } = await this.validateGrantRecord(
      binding,
      "THREAD_REPLY",
    );
    if (!isExternalReplyAllowed(thread.state)) {
      throw this.externalAccessDenied();
    }

    const at = this.currentTime();
    await this.requireSessionBindingCurrent(binding, at);
    const message: Message = {
      messageId: this.idGenerator.generate("message"),
      deploymentId: authority.deploymentId,
      threadId: authority.threadId,
      direction: "EXTERNAL_TO_STAFF",
      actorRef: grant.externalParticipantRef,
      createdAt: at,
      body: createPlainTextMessageBody(messageBody),
    };
    const nextThread = recordExternalThreadActivity(thread, thread.version, at);

    try {
      await this.workflowStore.commit({
        deploymentId: authority.deploymentId,
        threadId: authority.threadId,
        expectedThreadVersion: thread.version,
        accessGrantAuthorityGuards: [
          {
            deploymentId: authority.deploymentId,
            threadId: authority.threadId,
            grantId: grant.grantId,
            expectedVersion: grant.version,
            requiredOperation: "THREAD_REPLY",
            validAt: at,
          },
        ],
        nextThread,
        messages: [message],
        auditEvents: [
          {
            eventId: this.idGenerator.generate("audit"),
            deploymentId: authority.deploymentId,
            threadId: authority.threadId,
            eventType: "MESSAGE_APPENDED",
            actorRef: grant.externalParticipantRef,
            actorKind: "EXTERNAL",
            at,
            messageId: message.messageId,
            accessGrantId: grant.grantId,
            outcome: "SUCCEEDED",
          },
        ],
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "STALE_VERSION" ||
          error.code === "ACCESS_GRANT_AUTHORITY_CHANGED")
      ) {
        throw this.externalAccessDenied();
      }
      throw error;
    }

    return { threadId: authority.threadId, createdAt: at };
  }

  async listExternalAttachmentCandidates(
    binding: ValidatedBrowserSessionBinding,
  ): Promise<readonly SessionExternalAttachmentCandidate[]> {
    const { authority } = await this.validateGrantRecord(
      binding,
      "ATTACHMENT_READ",
    );
    try {
      const messages = await this.workflowStore.listMessages(
        authority.deploymentId,
        authority.threadId,
      );
      const candidates: SessionExternalAttachmentCandidate[] = [];
      for (const message of messages) {
        const attachments = await this.workflowStore.listAttachmentsForMessage(
          authority.deploymentId,
          authority.threadId,
          message.messageId,
        );
        for (const attachment of attachments) {
          if (
            attachment.deploymentId === authority.deploymentId &&
            attachment.threadId === authority.threadId &&
            attachment.messageId === message.messageId &&
            attachment.state === "CLEAN" &&
            attachment.deletedAt === undefined
          ) {
            candidates.push({
              messageId: message.messageId,
              attachmentId: attachment.attachmentId,
              safeDownloadFilename: attachment.safeDownloadFilename,
              normalizedMediaType: attachment.normalizedMediaType,
              byteLength: attachment.sizeBytes,
            });
          }
        }
      }
      return candidates;
    } catch {
      throw this.externalAccessDenied();
    }
  }

  async retrieveExternalAttachment(
    binding: ValidatedBrowserSessionBinding,
    messageId: MessageId,
    attachmentId: AttachmentId,
  ): Promise<SessionExternalAttachmentRetrievalResult> {
    const { authority } = await this.validateGrantRecord(
      binding,
      "ATTACHMENT_READ",
    );
    const at = this.currentTime();
    await this.requireSessionBindingCurrent(binding, at);
    try {
      const result = await retrieveAuthorizedAttachment(
        {
          store: this.workflowStore,
          contentStore: this.contentStore,
          idGenerator: this.idGenerator,
        },
        {
          deploymentId: authority.deploymentId,
          threadId: authority.threadId,
          messageId,
          attachmentId,
          at,
          expectedThreadVersion: authority.threadVersion,
          authority: {
            actorRef: authority.externalParticipantRef,
            actorKind: "EXTERNAL",
            accessGrantId: authority.grantId,
          },
        },
      );
      return {
        safeDownloadFilename: result.safeDownloadFilename,
        normalizedMediaType: result.normalizedMediaType,
        byteLength: result.byteLength,
        content: result.content,
      };
    } catch {
      throw this.externalAccessDenied();
    }
  }

  private async validateGrantRecord(
    binding: ValidatedBrowserSessionBinding,
    operation: AccessGrantOperation,
  ): Promise<ValidatedGrantRecord> {
    if (!isValidatedBrowserSessionBinding(binding)) {
      throw this.externalAccessDenied();
    }
    await this.requireSessionBindingCurrent(binding, this.currentTime());

    const grant = await this.workflowStore.getAccessGrant(
      binding.deploymentId,
      binding.accessGrantId,
    );
    if (
      grant?.deploymentId !== binding.deploymentId ||
      grant.threadId !== binding.threadId
    ) {
      throw this.externalAccessDenied();
    }
    try {
      validateAccessGrant(grant);
    } catch {
      throw this.externalAccessDenied();
    }
    const now = Date.parse(this.currentTime());
    if (
      grant.revokedAt !== undefined ||
      !Number.isFinite(now) ||
      now >= Date.parse(grant.expiresAt) ||
      !grant.permittedOperations.includes(operation)
    ) {
      throw this.externalAccessDenied();
    }

    const thread = await this.workflowStore.getThread(
      binding.deploymentId,
      binding.threadId,
    );
    if (
      thread?.deploymentId !== binding.deploymentId ||
      thread.threadId !== grant.threadId ||
      !isExternalAccessThreadEligible(thread.state) ||
      (operation === "THREAD_REPLY" && !isExternalReplyAllowed(thread.state))
    ) {
      throw this.externalAccessDenied();
    }

    return {
      grant,
      thread,
      authority: {
        grantId: grant.grantId,
        deploymentId: grant.deploymentId,
        threadId: grant.threadId,
        externalParticipantRef: grant.externalParticipantRef,
        operation,
        accessGrantVersion: grant.version,
        threadVersion: thread.version,
        sessionId: binding.sessionId,
        sessionVersion: binding.sessionVersion,
      },
    };
  }

  private async requireSessionBindingCurrent(
    binding: ValidatedBrowserSessionBinding,
    at: string,
  ): Promise<void> {
    if (!isValidatedBrowserSessionBinding(binding)) {
      throw this.externalAccessDenied();
    }
    const session = await this.sessionStore.getBrowserSession(
      binding.deploymentId,
      binding.sessionId,
    );
    if (
      session?.deploymentId !== binding.deploymentId ||
      session.threadId !== binding.threadId ||
      session.accessGrantId !== binding.accessGrantId ||
      session.version !== binding.sessionVersion
    ) {
      throw this.externalAccessDenied();
    }
    try {
      validateBrowserSession(session);
    } catch {
      throw this.externalAccessDenied();
    }
    if (!isBrowserSessionActiveAt(session, at)) {
      throw this.externalAccessDenied();
    }
  }

  private currentTime(): string {
    const now = this.clock.now();
    if (!Number.isFinite(Date.parse(now))) {
      throw new Error("Clock returned an invalid timestamp.");
    }
    return now;
  }

  private externalAccessDenied(): ApplicationError {
    return new ApplicationError(
      "EXTERNAL_ACCESS_DENIED",
      "External access is not available for the presented authority.",
    );
  }
}
