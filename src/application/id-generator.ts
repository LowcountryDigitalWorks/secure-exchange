export type OpaqueIdPurpose =
  | "external-participant"
  | "thread"
  | "message"
  | "attachment"
  | "content"
  | "access-grant"
  | "audit";

export interface OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string;
}
