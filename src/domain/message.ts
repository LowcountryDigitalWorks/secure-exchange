import { DomainError } from "./errors.js";
import type { DeploymentId, MessageId, ThreadId } from "./types.js";

export const MAX_MESSAGE_BODY_LENGTH = 8_000;

function containsDisallowedMessageControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint === 0x7f ||
        (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a))
    ) {
      return true;
    }
  }

  return false;
}

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
  readonly actorRef: string;
  readonly createdAt: string;
  readonly body: PlainTextMessageBody;
}

export function createPlainTextMessageBody(text: string): PlainTextMessageBody {
  const normalized = text.replace(/\r\n?/gu, "\n");

  if (
    normalized.trim().length === 0 ||
    normalized.length > MAX_MESSAGE_BODY_LENGTH ||
    containsDisallowedMessageControl(normalized)
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
