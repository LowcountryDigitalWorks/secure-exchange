export type ApplicationErrorCode =
  | "RESOURCE_NOT_FOUND"
  | "AUTHORIZATION_DENIED"
  | "POLICY_NOT_FOUND"
  | "COMPLETION_PRECONDITION_FAILED"
  | "ATTESTATION_NOT_FOUND"
  | "ATTESTATION_ALREADY_CONTROLLED"
  | "USE_COMPLETION_SERVICE";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
