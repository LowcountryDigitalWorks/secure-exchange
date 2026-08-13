export type OpaqueIdPurpose =
  | "external-participant"
  | "thread"
  | "message"
  | "attachment"
  | "content"
  | "audit";

export interface OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string;
}
