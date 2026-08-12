import { DomainError } from "./errors.js";
import type {
  ActorRef,
  DeploymentId,
  ExternalParticipantRef,
  MessageId,
  ThreadId,
} from "./types.js";

export const MAX_MESSAGE_BODY_LENGTH = 8_000;

const DISALLOWED_MESSAGE_CONTROL =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export type MessageDirection = "EXTERNAL_TO_STAFF" | "STAFF_TO_EXTERNAL";

export interface PlainTextMessageBody {
  readonly kind: "PLAIN_TEXT";
  readonly text: string;
}

export interface Message {
  readonly messageId: MessageId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly direction: MessageDirection;
  readonly actorRef: ActorRef | ExternalParticipantRef;
  readonly createdAt: string;
  readonly body: PlainTextMessageBody;
}

export function createPlainTextMessageBody(
  text: string,
): PlainTextMessageBody {
  const normalized = text.replace(/\r\n?/gu, "\n");

  if (
    normalized.trim().length === 0 ||
    normalized.length > MAX_MESSAGE_BODY_LENGTH ||
    DISALLOWED_MESSAGE_CONTROL.test(normalized)
  ) {
    throw new DomainError(
      "INVALID_MESSAGE_BODY",
      "Message body must be bounded non-empty plain text without disallowed control characters.",
    );
  }

  return {
    kind: "PLAIN_TEXT",
    text: normalized,
  };
}
