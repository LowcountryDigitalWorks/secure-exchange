import { DomainError } from "./errors.js";
import type {
  AccessGrantId,
  BootstrapId,
  BrowserSessionId,
  DeploymentId,
  ThreadId,
} from "./types.js";

export type BootstrapVerificationMode =
  | "MAILBOX_ONLY"
  | "INDEPENDENT_CHALLENGE";

export type BootstrapInvalidationReason =
  | "LOCKED"
  | "REISSUED"
  | "ACCESS_GRANT_INVALID";

export interface BootstrapChallenge {
  readonly bootstrapId: BootstrapId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly accessGrantId: AccessGrantId;
  readonly verificationMode: BootstrapVerificationMode;
  readonly proofVerifierDigest: string;
  readonly proofVerifierAlgorithm: "HMAC-SHA-256";
  readonly proofVerifierVersion: 1;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly failedAttempts: number;
  readonly maxAttempts: number;
  readonly consumedAt?: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: BootstrapInvalidationReason;
  readonly generation: number;
  readonly version: number;
}

export type BrowserSessionInvalidationReason =
  | "LOGOUT"
  | "REPLACED"
  | "REISSUED";

export interface BrowserSession {
  readonly sessionId: BrowserSessionId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly accessGrantId: AccessGrantId;
  readonly verifierDigest: string;
  readonly establishedAt: string;
  readonly lastAuthorizedActivityAt: string;
  readonly absoluteExpiresAt: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: BrowserSessionInvalidationReason;
  readonly version: number;
}

export const BOOTSTRAP_MAX_ATTEMPTS = 5;
export const BOOTSTRAP_MAX_LIFETIME_SECONDS = 15 * 60;
export const BOOTSTRAP_FORM_GUARD_MAX_LIFETIME_SECONDS = 10 * 60;
export const BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS = 20 * 60;
export const BROWSER_SESSION_IDLE_LIFETIME_SECONDS = 10 * 60;

const MAX_REFERENCE_LENGTH = 160;
const BOOTSTRAP_VERIFIER_PATTERN = /^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u;
const SESSION_VERIFIER_PATTERN = /^sha256:v1:[A-Za-z0-9_-]{43}$/u;

function assertReference(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.length > MAX_REFERENCE_LENGTH ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f);
    })
  ) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      `${label} is invalid.`,
    );
  }
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      "External delivery timing metadata is invalid.",
    );
  }
  return parsed;
}

export function validateBootstrapChallenge(
  challenge: BootstrapChallenge,
): BootstrapChallenge {
  assertReference(challenge.bootstrapId, "Bootstrap identifier");
  assertReference(challenge.deploymentId, "Deployment identifier");
  assertReference(challenge.threadId, "Thread identifier");
  assertReference(challenge.accessGrantId, "AccessGrant identifier");

  if (!BOOTSTRAP_VERIFIER_PATTERN.test(challenge.proofVerifierDigest)) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      "Bootstrap proof verifier metadata is invalid.",
    );
  }

  const issuedAt = parseTimestamp(challenge.issuedAt);
  const expiresAt = parseTimestamp(challenge.expiresAt);
  const consumedAt =
    challenge.consumedAt === undefined
      ? undefined
      : parseTimestamp(challenge.consumedAt);
  const invalidatedAt =
    challenge.invalidatedAt === undefined
      ? undefined
      : parseTimestamp(challenge.invalidatedAt);

  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > BOOTSTRAP_MAX_LIFETIME_SECONDS * 1_000 ||
    !Number.isSafeInteger(challenge.failedAttempts) ||
    challenge.failedAttempts < 0 ||
    !Number.isSafeInteger(challenge.maxAttempts) ||
    challenge.maxAttempts <= 0 ||
    challenge.maxAttempts > BOOTSTRAP_MAX_ATTEMPTS ||
    challenge.failedAttempts > challenge.maxAttempts ||
    !Number.isSafeInteger(challenge.generation) ||
    challenge.generation <= 0 ||
    !Number.isSafeInteger(challenge.version) ||
    challenge.version <= 0 ||
    (consumedAt !== undefined &&
      (consumedAt < issuedAt || consumedAt >= expiresAt)) ||
    (invalidatedAt !== undefined && invalidatedAt < issuedAt) ||
    (consumedAt !== undefined && invalidatedAt !== undefined) ||
    (challenge.invalidationReason === undefined) !==
      (challenge.invalidatedAt === undefined) ||
    (challenge.invalidationReason === "LOCKED" &&
      challenge.failedAttempts !== challenge.maxAttempts)
  ) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      "Bootstrap challenge state is invalid.",
    );
  }

  return challenge;
}

export function validateBrowserSession(session: BrowserSession): BrowserSession {
  assertReference(session.sessionId, "Browser session identifier");
  assertReference(session.deploymentId, "Deployment identifier");
  assertReference(session.threadId, "Thread identifier");
  assertReference(session.accessGrantId, "AccessGrant identifier");

  if (!SESSION_VERIFIER_PATTERN.test(session.verifierDigest)) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      "Browser session verifier metadata is invalid.",
    );
  }

  const establishedAt = parseTimestamp(session.establishedAt);
  const lastActivity = parseTimestamp(session.lastAuthorizedActivityAt);
  const absoluteExpiresAt = parseTimestamp(session.absoluteExpiresAt);
  const invalidatedAt =
    session.invalidatedAt === undefined
      ? undefined
      : parseTimestamp(session.invalidatedAt);

  if (
    lastActivity < establishedAt ||
    absoluteExpiresAt <= establishedAt ||
    absoluteExpiresAt - establishedAt >
      BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000 ||
    lastActivity >= absoluteExpiresAt ||
    (invalidatedAt !== undefined && invalidatedAt < establishedAt) ||
    (session.invalidationReason === undefined) !==
      (session.invalidatedAt === undefined) ||
    !Number.isSafeInteger(session.version) ||
    session.version <= 0
  ) {
    throw new DomainError(
      "INVALID_EXTERNAL_SESSION",
      "Browser session state is invalid.",
    );
  }

  return session;
}

export function isBootstrapChallengeAvailableAt(
  challenge: BootstrapChallenge,
  at: string,
): boolean {
  validateBootstrapChallenge(challenge);
  const now = Date.parse(at);
  return (
    Number.isFinite(now) &&
    now >= Date.parse(challenge.issuedAt) &&
    now < Date.parse(challenge.expiresAt) &&
    challenge.consumedAt === undefined &&
    challenge.invalidatedAt === undefined &&
    challenge.failedAttempts < challenge.maxAttempts
  );
}

function requireBootstrapVersion(
  challenge: BootstrapChallenge,
  expectedVersion: number,
  expectedGeneration: number,
): void {
  if (
    challenge.version !== expectedVersion ||
    challenge.generation !== expectedGeneration
  ) {
    throw new DomainError(
      "BOOTSTRAP_AUTHORITY_CHANGED",
      "Bootstrap challenge authority changed before mutation.",
    );
  }
}

export function recordBootstrapFailure(
  challenge: BootstrapChallenge,
  expectedVersion: number,
  expectedGeneration: number,
  at: string,
): BootstrapChallenge {
  validateBootstrapChallenge(challenge);
  requireBootstrapVersion(challenge, expectedVersion, expectedGeneration);
  if (!isBootstrapChallengeAvailableAt(challenge, at)) {
    throw new DomainError(
      "BOOTSTRAP_AUTHORITY_CHANGED",
      "Bootstrap challenge is not available for an attempt.",
    );
  }

  const failedAttempts = challenge.failedAttempts + 1;
  const locked = failedAttempts === challenge.maxAttempts;
  return validateBootstrapChallenge({
    ...challenge,
    failedAttempts,
    generation: challenge.generation + 1,
    version: challenge.version + 1,
    ...(locked
      ? {
          invalidatedAt: at,
          invalidationReason: "LOCKED" as const,
        }
      : {}),
  });
}

export function consumeBootstrapChallenge(
  challenge: BootstrapChallenge,
  expectedVersion: number,
  expectedGeneration: number,
  at: string,
): BootstrapChallenge {
  validateBootstrapChallenge(challenge);
  requireBootstrapVersion(challenge, expectedVersion, expectedGeneration);
  if (!isBootstrapChallengeAvailableAt(challenge, at)) {
    throw new DomainError(
      "BOOTSTRAP_AUTHORITY_CHANGED",
      "Bootstrap challenge is not available for consumption.",
    );
  }
  return validateBootstrapChallenge({
    ...challenge,
    consumedAt: at,
    generation: challenge.generation + 1,
    version: challenge.version + 1,
  });
}

export function invalidateBootstrapChallenge(
  challenge: BootstrapChallenge,
  expectedVersion: number,
  expectedGeneration: number,
  at: string,
  reason: Exclude<BootstrapInvalidationReason, "LOCKED">,
): BootstrapChallenge {
  validateBootstrapChallenge(challenge);
  requireBootstrapVersion(challenge, expectedVersion, expectedGeneration);
  if (challenge.consumedAt !== undefined || challenge.invalidatedAt !== undefined) {
    return challenge;
  }
  return validateBootstrapChallenge({
    ...challenge,
    invalidatedAt: at,
    invalidationReason: reason,
    generation: challenge.generation + 1,
    version: challenge.version + 1,
  });
}

export function isBrowserSessionActiveAt(
  session: BrowserSession,
  at: string,
): boolean {
  validateBrowserSession(session);
  const now = Date.parse(at);
  const idleExpiresAt =
    Date.parse(session.lastAuthorizedActivityAt) +
    BROWSER_SESSION_IDLE_LIFETIME_SECONDS * 1_000;
  return (
    Number.isFinite(now) &&
    now >= Date.parse(session.establishedAt) &&
    now < Date.parse(session.absoluteExpiresAt) &&
    now < idleExpiresAt &&
    session.invalidatedAt === undefined
  );
}

export function recordBrowserSessionActivity(
  session: BrowserSession,
  expectedVersion: number,
  at: string,
): BrowserSession {
  validateBrowserSession(session);
  if (session.version !== expectedVersion || !isBrowserSessionActiveAt(session, at)) {
    throw new DomainError(
      "BROWSER_SESSION_AUTHORITY_CHANGED",
      "Browser session authority changed before activity update.",
    );
  }
  return validateBrowserSession({
    ...session,
    lastAuthorizedActivityAt: at,
    version: session.version + 1,
  });
}

export function invalidateBrowserSession(
  session: BrowserSession,
  expectedVersion: number,
  at: string,
  reason: BrowserSessionInvalidationReason,
): BrowserSession {
  validateBrowserSession(session);
  if (session.version !== expectedVersion) {
    throw new DomainError(
      "BROWSER_SESSION_AUTHORITY_CHANGED",
      "Browser session authority changed before invalidation.",
    );
  }
  if (session.invalidatedAt !== undefined) {
    return session;
  }
  return validateBrowserSession({
    ...session,
    invalidatedAt: at,
    invalidationReason: reason,
    version: session.version + 1,
  });
}
