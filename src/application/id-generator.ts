export type OpaqueIdPurpose =
  | "external-participant"
  | "thread"
  | "message"
  | "audit";

export interface OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string;
}
