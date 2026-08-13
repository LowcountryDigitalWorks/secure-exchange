import { DomainError } from "./errors.js";
import type {
  AccessGrantId,
  AccessGrantPolicyRef,
  DeploymentId,
  ExternalParticipantRef,
  ThreadId,
} from "./types.js";
import type { Thread, ThreadLifecycleState } from "./thread.js";

export type AccessGrantOperation = "THREAD_READ";

export interface AccessGrantPolicy {
  readonly policyRef: AccessGrantPolicyRef;
  readonly deploymentId: DeploymentId;
  readonly maxLifetimeSeconds: number;
  readonly allowedOperations: readonly AccessGrantOperation[];
}

export interface AccessGrant {
  readonly grantId: AccessGrantId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly externalParticipantRef: ExternalParticipantRef;
  readonly policyRef: AccessGrantPolicyRef;
  readonly verifierDigest: string;
  readonly permittedOperations: readonly AccessGrantOperation[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
  readonly version: number;
}

const ACCESS_GRANT_OPERATIONS: readonly AccessGrantOperation[] = [
  "THREAD_READ",
];
const MAX_REFERENCE_LENGTH = 128;
const VERIFIER_PATTERN = /^sha256:v1:[A-Za-z0-9_-]{43}$/u;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function assertBoundedReference(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.length > MAX_REFERENCE_LENGTH ||
    hasControlCharacters(value)
  ) {
    throw new DomainError("INVALID_ACCESS_GRANT", `${label} is invalid.`);
  }
}

function normalizeOperations(
  operations: readonly AccessGrantOperation[],
  errorCode: "INVALID_ACCESS_GRANT" | "INVALID_ACCESS_GRANT_POLICY",
): readonly AccessGrantOperation[] {
  const unique = [...new Set(operations)];
  if (
    unique.length === 0 ||
    unique.length !== operations.length ||
    unique.some((operation) => !ACCESS_GRANT_OPERATIONS.includes(operation))
  ) {
    throw new DomainError(errorCode, "AccessGrant operations are invalid.");
  }
  return unique;
}

export function validateAccessGrantPolicy(
  policy: AccessGrantPolicy,
): AccessGrantPolicy {
  if (
    policy.policyRef.length === 0 ||
    policy.deploymentId.length === 0 ||
    !Number.isSafeInteger(policy.maxLifetimeSeconds) ||
    policy.maxLifetimeSeconds <= 0
  ) {
    throw new DomainError(
      "INVALID_ACCESS_GRANT_POLICY",
      "AccessGrant policy limits or identifiers are invalid.",
    );
  }
  normalizeOperations(policy.allowedOperations, "INVALID_ACCESS_GRANT_POLICY");
  return policy;
}

export function validateAccessGrant(grant: AccessGrant): AccessGrant {
  assertBoundedReference(grant.grantId, "AccessGrant identifier");
  assertBoundedReference(grant.deploymentId, "Deployment identifier");
  assertBoundedReference(grant.threadId, "Thread identifier");
  assertBoundedReference(
    grant.externalParticipantRef,
    "External participant reference",
  );
  assertBoundedReference(grant.policyRef, "AccessGrant policy reference");
  if (!VERIFIER_PATTERN.test(grant.verifierDigest)) {
    throw new DomainError(
      "INVALID_ACCESS_GRANT",
      "AccessGrant verifier format is invalid.",
    );
  }
  normalizeOperations(grant.permittedOperations, "INVALID_ACCESS_GRANT");

  const issuedAt = Date.parse(grant.issuedAt);
  const expiresAt = Date.parse(grant.expiresAt);
  const revokedAt =
    grant.revokedAt === undefined ? undefined : Date.parse(grant.revokedAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    (revokedAt !== undefined &&
      (!Number.isFinite(revokedAt) || revokedAt < issuedAt)) ||
    !Number.isSafeInteger(grant.version) ||
    grant.version <= 0
  ) {
    throw new DomainError(
      "INVALID_ACCESS_GRANT",
      "AccessGrant timing or version metadata is invalid.",
    );
  }

  return grant;
}

export function isExternalAccessThreadEligible(
  state: ThreadLifecycleState,
): boolean {
  return state !== "EXPIRED" && state !== "DISPOSED";
}

export function requireExternalAccessThreadEligible(thread: Thread): void {
  if (!isExternalAccessThreadEligible(thread.state)) {
    throw new DomainError(
      "ACCESS_GRANT_THREAD_NOT_ELIGIBLE",
      "Thread is not eligible for external AccessGrant use.",
    );
  }
}

export function revokeAccessGrant(
  grant: AccessGrant,
  expectedVersion: number,
  revokedAt: string,
): AccessGrant {
  validateAccessGrant(grant);
  if (grant.revokedAt !== undefined) {
    return grant;
  }
  if (grant.version !== expectedVersion) {
    throw new DomainError(
      "STALE_VERSION",
      `Expected AccessGrant version ${expectedVersion}, found ${grant.version}.`,
    );
  }
  if (!Number.isFinite(Date.parse(revokedAt))) {
    throw new DomainError(
      "INVALID_ACCESS_GRANT",
      "AccessGrant revocation timestamp is invalid.",
    );
  }
  return {
    ...grant,
    revokedAt,
    version: grant.version + 1,
  };
}
