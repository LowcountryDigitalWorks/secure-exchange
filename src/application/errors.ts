export type ApplicationErrorCode =
  | "RESOURCE_NOT_FOUND"
  | "AUTHORIZATION_DENIED"
  | "ROUTING_NOT_AVAILABLE"
  | "POLICY_NOT_FOUND"
  | "COMPLETION_PRECONDITION_FAILED"
  | "ATTESTATION_NOT_FOUND"
  | "ATTESTATION_ALREADY_CONTROLLED"
  | "USE_COMPLETION_SERVICE"
  | "ATTACHMENT_POLICY_NOT_FOUND"
  | "ATTACHMENT_POLICY_REJECTED"
  | "ATTACHMENT_NOT_FOUND"
  | "ATTACHMENT_NOT_RETRIEVABLE"
  | "CONTENT_STORAGE_FAILED"
  | "CONTENT_NOT_AVAILABLE"
  | "ATTACHMENT_PUBLICATION_FAILED";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
