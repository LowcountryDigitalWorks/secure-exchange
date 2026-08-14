export type OpaqueIdPurpose =
  | "external-participant"
  | "thread"
  | "message"
  | "attachment"
  | "content"
  | "access-grant"
  | "bootstrap"
  | "browser-session"
  | "audit";

export interface OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string;
}
