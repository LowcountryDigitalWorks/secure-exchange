export type DomainErrorCode =
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "REPLY_NOT_ALLOWED"
  | "INVALID_ATTESTATION_CONTROL"
  | "INVALID_MESSAGE_BODY"
  | "INVALID_ROUTING_CATEGORY"
  | "INVALID_QUEUE_CONFIGURATION";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
