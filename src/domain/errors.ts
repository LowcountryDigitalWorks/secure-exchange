export type DomainErrorCode =
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "INVALID_ATTESTATION_CONTROL";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
