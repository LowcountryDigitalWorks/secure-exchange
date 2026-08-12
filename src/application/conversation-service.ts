import {
  createPlainTextMessageBody,
  queueAllowsRoutingCategory,
  recordThreadActivity,
  requireStaffReplyAllowed,
  validateRoutingCategory,
  type ActorAuthorization,
  type ActorContext,
  type AuditEvent,
  type AuditEventId,
  type DeploymentId,
  type ExternalParticipantRef,
  type Message,
  type MessageId,
  type Queue,
  type QueueId,
  type Thread,
  type ThreadId,
  type ThreadLifecycleState,
  type WorkflowPermission,
} from "../domain/index.js";
import { ApplicationError } from "./errors.js";
import type { WorkflowStore } from "./ports.js";

const MAX_EXTERNAL_PARTICIPANT_REF_LENGTH = 128;
function containsReferenceControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }

  return false;
}

export interface InitiateExternalExchangeInput {
  readonly deploymentId: DeploymentId;
  readonly queueId: QueueId;
  readonly routingCategory: string;
  readonly threadId: ThreadId;
  readonly externalParticipantRef: ExternalParticipantRef;
  readonly messageId: MessageId;
  readonly initialMessage: string;
  readonly threadCreatedAuditEventId: AuditEventId;
  readonly messageAuditEventId: AuditEventId;
  readonly at: string;
}

export interface InitiatedExchange {
  readonly thread: Thread;
  readonly message: Message;
}

export interface ListQueueCandidatesInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly queueId: QueueId;
}

export interface QueueCandidate {
  readonly threadId: ThreadId;
  readonly queueId: QueueId;
  readonly routingCategory: string;
  readonly state: ThreadLifecycleState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastActivityAt: string;
  readonly attentionAt?: string;
}

export interface ReadConversationInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
}

export interface OpenConversationInput extends ReadConversationInput {
  readonly auditEventId: AuditEventId;
  readonly at: string;
}

export interface ConversationReadModel {
  readonly thread: Thread;
  readonly messages: readonly Message[];
}

export interface ReplyToConversationInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly expectedVersion: number;
  readonly messageId: MessageId;
  readonly messageBody: string;
  readonly auditEventId: AuditEventId;
  readonly at: string;
}

export interface ReplyResult {
  readonly thread: Thread;
  readonly message: Message;
}

interface AuthorizedThread {
  readonly thread: Thread;
  readonly authorization: ActorAuthorization;
}

export class ConversationService {
  constructor(private readonly store: WorkflowStore) {}

  async initiateExternalExchange(
    input: InitiateExternalExchangeInput,
  ): Promise<InitiatedExchange> {
    const queue = await this.store.getQueue(input.deploymentId, input.queueId);
    const routingCategory = validateRoutingCategory(input.routingCategory);

    if (
      queue?.deploymentId !== input.deploymentId ||
      !queue.active ||
      !queueAllowsRoutingCategory(queue, routingCategory)
    ) {
      throw new ApplicationError(
        "ROUTING_NOT_AVAILABLE",
        "Requested external routing is not available.",
      );
    }

    const externalParticipantRef = this.externalParticipantRef(
      input.externalParticipantRef,
    );
    const body = createPlainTextMessageBody(input.initialMessage);
    const thread: Thread = {
      threadId: input.threadId,
      deploymentId: input.deploymentId,
      queueId: queue.queueId,
      routingCategory,
      state: "NEW",
      createdAt: input.at,
      updatedAt: input.at,
      lastActivityAt: input.at,
      attentionAt: input.at,
      version: 1,
    };
    const message: Message = {
      messageId: input.messageId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      direction: "EXTERNAL_TO_STAFF",
      actorRef: externalParticipantRef,
      createdAt: input.at,
      body,
    };

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      newThread: thread,
      messages: [message],
      auditEvents: [
        this.externalAuditEvent(
          input,
          externalParticipantRef,
          "THREAD_CREATED",
          input.threadCreatedAuditEventId,
        ),
        {
          ...this.externalAuditEvent(
            input,
            externalParticipantRef,
            "MESSAGE_APPENDED",
            input.messageAuditEventId,
          ),
          messageId: message.messageId,
        },
      ],
    });

    return { thread, message };
  }

  async listQueueCandidates(
    input: ListQueueCandidatesInput,
  ): Promise<readonly QueueCandidate[]> {
    await this.loadAuthorizedQueue(input, "QUEUE_LIST");

    const threads = await this.store.listThreadsForQueue(
      input.deploymentId,
      input.queueId,
    );

    return threads
      .map((thread): QueueCandidate => ({
        threadId: thread.threadId,
        queueId: thread.queueId,
        routingCategory: thread.routingCategory,
        state: thread.state,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastActivityAt: thread.lastActivityAt,
        ...(thread.attentionAt === undefined
          ? {}
          : { attentionAt: thread.attentionAt }),
      }))
      .sort(
        (left, right) =>
          right.lastActivityAt.localeCompare(left.lastActivityAt) ||
          left.threadId.localeCompare(right.threadId),
      );
  }

  async readStaffConversation(
    input: ReadConversationInput,
  ): Promise<ConversationReadModel> {
    const { thread } = await this.loadAuthorizedThread(input, "THREAD_OPEN");
    const messages = await this.store.listMessages(
      input.deploymentId,
      input.threadId,
    );

    return { thread, messages };
  }

  async openStaffConversation(
    input: OpenConversationInput,
  ): Promise<ConversationReadModel> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "THREAD_OPEN",
    );

    const messages = await this.store.listMessages(
      input.deploymentId,
      input.threadId,
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      auditEvents: [
        this.staffAuditEvent(
          input,
          authorization,
          "THREAD_OPENED",
          input.auditEventId,
          input.at,
        ),
      ],
    });

    return { thread, messages };
  }

  async replyToConversation(
    input: ReplyToConversationInput,
  ): Promise<ReplyResult> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "THREAD_REPLY",
    );
    this.requireStaffActor(authorization);
    requireStaffReplyAllowed(thread);

    const message: Message = {
      messageId: input.messageId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      direction: "STAFF_TO_EXTERNAL",
      actorRef: authorization.actorRef,
      createdAt: input.at,
      body: createPlainTextMessageBody(input.messageBody),
    };
    const nextThread = recordThreadActivity(
      thread,
      input.expectedVersion,
      input.at,
    );

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: input.expectedVersion,
      nextThread,
      messages: [message],
      auditEvents: [
        {
          ...this.staffAuditEvent(
            input,
            authorization,
            "MESSAGE_APPENDED",
            input.auditEventId,
            input.at,
          ),
          messageId: message.messageId,
        },
      ],
    });

    return { thread: nextThread, message };
  }

  private async loadAuthorizedQueue(
    input: ListQueueCandidatesInput,
    permission: WorkflowPermission,
  ): Promise<{
    readonly queue: Queue;
    readonly authorization: ActorAuthorization;
  }> {
    if (input.actor.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor deployment does not match the requested deployment.",
      );
    }

    const queue = await this.store.getQueue(input.deploymentId, input.queueId);
    if (queue?.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Authoritative queue was not found in the requested deployment.",
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
      !authorization.allowedQueueIds.includes(queue.queueId) ||
      !authorization.permissions.includes(permission)
    ) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor is not authorized for this authoritative queue action.",
      );
    }

    return { queue, authorization };
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
        "Actor is not authorized for this authoritative thread action.",
      );
    }

    return { thread, authorization };
  }

  private requireStaffActor(authorization: ActorAuthorization): void {
    if (authorization.actorKind !== "STAFF") {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Conversation replies require an authenticated staff actor.",
      );
    }
  }

  private externalParticipantRef(
    value: ExternalParticipantRef,
  ): ExternalParticipantRef {
    if (
      value.length === 0 ||
      value.length > MAX_EXTERNAL_PARTICIPANT_REF_LENGTH ||
      containsReferenceControl(value)
    ) {
      throw new ApplicationError(
        "ROUTING_NOT_AVAILABLE",
        "External participant reference is not valid for submission.",
      );
    }

    return value;
  }

  private externalAuditEvent(
    input: InitiateExternalExchangeInput,
    actorRef: ExternalParticipantRef,
    eventType: AuditEvent["eventType"],
    eventId: AuditEventId,
  ): AuditEvent {
    return {
      eventId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      eventType,
      actorRef,
      actorKind: "EXTERNAL",
      at: input.at,
      outcome: "SUCCEEDED",
    };
  }

  private staffAuditEvent(
    input: {
      readonly deploymentId: DeploymentId;
      readonly threadId: ThreadId;
    },
    authorization: ActorAuthorization,
    eventType: AuditEvent["eventType"],
    eventId: AuditEventId,
    at: string,
  ): AuditEvent {
    return {
      eventId,
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      eventType,
      actorRef: authorization.actorRef,
      actorKind: authorization.actorKind,
      at,
      outcome: "SUCCEEDED",
    };
  }
}
