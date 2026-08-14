import {
  BOOTSTRAP_FORM_GUARD_MAX_LIFETIME_SECONDS,
  BOOTSTRAP_MAX_ATTEMPTS,
  BOOTSTRAP_MAX_LIFETIME_SECONDS,
  BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS,
  consumeBootstrapChallenge,
  invalidateBootstrapChallenge,
  invalidateBrowserSession,
  isBootstrapChallengeAvailableAt,
  isBrowserSessionActiveAt,
  isExternalAccessThreadEligible,
  isExternalReplyAllowed,
  recordBootstrapFailure,
  recordBrowserSessionActivity,
  validateAccessGrant,
  validateBootstrapChallenge,
  validateBrowserSession,
  type AccessGrant,
  type AccessGrantId,
  type BootstrapChallenge,
  type BootstrapId,
  type BootstrapVerificationMode,
  type BrowserSession,
  type BrowserSessionId,
  type DeploymentId,
  type Thread,
  type ThreadId,
} from "../domain/index.js";
import type { Clock } from "./clock.js";
import { ApplicationError } from "./errors.js";
import type {
  BootstrapFormGuardManager,
  BootstrapProofManager,
  BrowserSessionSecretManager,
} from "./external-session-security.js";
import type { ExternalSessionStore } from "./external-session-store.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { WorkflowStore } from "./ports.js";

const trustedBindings = new WeakSet<object>();
const bindingToken = Symbol("validated-browser-session-binding");

export class ValidatedBrowserSessionBinding {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly accessGrantId: AccessGrantId;
  readonly sessionId: BrowserSessionId;
  readonly sessionVersion: number;
  readonly validatedAt: string;

  constructor(
    token: symbol,
    input: {
      readonly deploymentId: DeploymentId;
      readonly threadId: ThreadId;
      readonly accessGrantId: AccessGrantId;
      readonly sessionId: BrowserSessionId;
      readonly sessionVersion: number;
      readonly validatedAt: string;
    },
  ) {
    if (token !== bindingToken) {
      throw new Error("Validated browser session bindings are application-owned.");
    }
    this.deploymentId = input.deploymentId;
    this.threadId = input.threadId;
    this.accessGrantId = input.accessGrantId;
    this.sessionId = input.sessionId;
    this.sessionVersion = input.sessionVersion;
    this.validatedAt = input.validatedAt;
    trustedBindings.add(this);
  }
}

export function isValidatedBrowserSessionBinding(
  value: unknown,
): value is ValidatedBrowserSessionBinding {
  return typeof value === "object" && value !== null && trustedBindings.has(value);
}

export interface IssueBootstrapChallengeInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly accessGrantId: AccessGrantId;
  readonly verificationMode: BootstrapVerificationMode;
  readonly requestedLifetimeSeconds: number;
}

export interface IssuedBootstrapChallenge {
  readonly bootstrapId: BootstrapId;
  readonly proof: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly generation: number;
}

export interface IssueBootstrapFormGuardInput {
  readonly deploymentId: DeploymentId;
  readonly bootstrapId: BootstrapId;
  readonly expectedOrigin: string;
}

export interface IssuedBootstrapFormGuardResult {
  readonly guard: string;
  readonly generation: number;
  readonly expiresAt: string;
}

export interface ExchangeBootstrapProofInput {
  readonly deploymentId: DeploymentId;
  readonly bootstrapId: BootstrapId;
  readonly expectedOrigin: string;
  readonly formGuard: string;
  readonly proof: string;
}

export interface EstablishedBrowserSession {
  readonly sessionId: BrowserSessionId;
  readonly bearer: string;
  readonly establishedAt: string;
  readonly absoluteExpiresAt: string;
}

export interface PresentBrowserSessionInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly sessionId: BrowserSessionId;
  readonly bearer: string;
}

export interface LogoutBrowserSessionInput extends PresentBrowserSessionInput {}

interface CurrentGrantTarget {
  readonly grant: AccessGrant;
  readonly thread: Thread;
}

export class ExternalSessionService {
  constructor(
    private readonly workflowStore: WorkflowStore,
    private readonly sessionStore: ExternalSessionStore,
    private readonly idGenerator: OpaqueIdGenerator,
    private readonly proofs: BootstrapProofManager,
    private readonly formGuards: BootstrapFormGuardManager,
    private readonly sessionSecrets: BrowserSessionSecretManager,
    private readonly clock: Clock,
  ) {}

  async issueBootstrapChallenge(
    input: IssueBootstrapChallengeInput,
  ): Promise<IssuedBootstrapChallenge> {
    const target = await this.loadCurrentGrantTarget(input);
    const issuedAt = this.currentTime();
    const challenge = await this.buildChallenge(input, target.grant, issuedAt);

    await this.confirmGrantTargetUnchanged(target, issuedAt);
    try {
      await this.sessionStore.commit({
        kind: "CREATE_CHALLENGE",
        challenge: challenge.record,
      });
    } catch {
      throw this.externalAccessDenied();
    }

    return challenge.result;
  }

  async reissueBootstrapChallenge(
    input: IssueBootstrapChallengeInput,
  ): Promise<IssuedBootstrapChallenge> {
    const target = await this.loadCurrentGrantTarget(input);
    const issuedAt = this.currentTime();
    const challenge = await this.buildChallenge(input, target.grant, issuedAt);

    await this.confirmGrantTargetUnchanged(target, issuedAt);
    try {
      await this.sessionStore.commit({
        kind: "REISSUE",
        reissue: {
          deploymentId: input.deploymentId,
          accessGrantId: input.accessGrantId,
          invalidatedAt: issuedAt,
          newChallenge: challenge.record,
        },
      });
    } catch {
      throw this.externalAccessDenied();
    }

    return challenge.result;
  }

  async issueBootstrapFormGuard(
    input: IssueBootstrapFormGuardInput,
  ): Promise<IssuedBootstrapFormGuardResult> {
    const expectedOrigin = this.normalizeExpectedOrigin(input.expectedOrigin);
    const challenge = await this.sessionStore.getBootstrapChallenge(
      input.deploymentId,
      input.bootstrapId,
    );
    const issuedAt = this.currentTime();
    if (
      challenge?.deploymentId !== input.deploymentId ||
      !isBootstrapChallengeAvailableAt(challenge, issuedAt)
    ) {
      throw this.externalAccessDenied();
    }

    const expiresAtMs = Math.min(
      Date.parse(issuedAt) + BOOTSTRAP_FORM_GUARD_MAX_LIFETIME_SECONDS * 1_000,
      Date.parse(challenge.expiresAt),
    );
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.parse(issuedAt)) {
      throw this.externalAccessDenied();
    }
    const expiresAt = new Date(expiresAtMs).toISOString();
    const issued = await this.formGuards.issue({
      bootstrapId: challenge.bootstrapId,
      generation: challenge.generation,
      origin: expectedOrigin,
      issuedAt,
      expiresAt,
    });
    return {
      guard: issued.guard,
      generation: challenge.generation,
      expiresAt: issued.expiresAt,
    };
  }

  async exchangeBootstrapProof(
    input: ExchangeBootstrapProofInput,
  ): Promise<EstablishedBrowserSession> {
    const expectedOrigin = this.normalizeExpectedOrigin(input.expectedOrigin);
    const challenge = await this.sessionStore.getBootstrapChallenge(
      input.deploymentId,
      input.bootstrapId,
    );
    const at = this.currentTime();
    if (
      challenge?.deploymentId !== input.deploymentId ||
      !isBootstrapChallengeAvailableAt(challenge, at)
    ) {
      throw this.externalAccessDenied();
    }

    const guardMatches = await this.formGuards
      .matches(input.formGuard, {
        bootstrapId: challenge.bootstrapId,
        generation: challenge.generation,
        origin: expectedOrigin,
        at,
      })
      .catch(() => false);
    if (!guardMatches) {
      throw this.externalAccessDenied();
    }

    const proofMatches = await this.proofs
      .matches(input.proof, challenge.proofVerifierDigest)
      .catch(() => false);
    if (!proofMatches) {
      await this.recordFailedProof(challenge, at);
      throw this.externalAccessDenied();
    }

    let target: CurrentGrantTarget;
    try {
      target = await this.loadCurrentGrantTarget({
        deploymentId: challenge.deploymentId,
        threadId: challenge.threadId,
        accessGrantId: challenge.accessGrantId,
      });
    } catch {
      await this.invalidateChallengeForGrantFailure(challenge, at);
      throw this.externalAccessDenied();
    }

    const sessionMaterial = await this.sessionSecrets.issue();
    const absoluteExpiresAtMs = Math.min(
      Date.parse(at) + BROWSER_SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,
      Date.parse(target.grant.expiresAt),
    );
    if (
      !Number.isFinite(absoluteExpiresAtMs) ||
      absoluteExpiresAtMs <= Date.parse(at)
    ) {
      await this.invalidateChallengeForGrantFailure(challenge, at);
      throw this.externalAccessDenied();
    }

    const consumed = consumeBootstrapChallenge(
      challenge,
      challenge.version,
      challenge.generation,
      at,
    );
    const session = validateBrowserSession({
      sessionId: this.idGenerator.generate("browser-session"),
      deploymentId: challenge.deploymentId,
      threadId: challenge.threadId,
      accessGrantId: challenge.accessGrantId,
      verifierDigest: sessionMaterial.verifierDigest,
      establishedAt: at,
      lastAuthorizedActivityAt: at,
      absoluteExpiresAt: new Date(absoluteExpiresAtMs).toISOString(),
      version: 1,
    });

    try {
      await this.confirmGrantTargetUnchanged(target, at);
      await this.sessionStore.commit({
        kind: "EXCHANGE_CHALLENGE",
        exchange: {
          expectedChallengeVersion: challenge.version,
          expectedChallengeGeneration: challenge.generation,
          consumedChallenge: consumed,
          newSession: session,
          replacementAt: at,
        },
      });
    } catch {
      await this.invalidateChallengeForGrantFailure(challenge, at).catch(
        () => undefined,
      );
      throw this.externalAccessDenied();
    }

    return {
      sessionId: session.sessionId,
      bearer: sessionMaterial.bearer,
      establishedAt: session.establishedAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }

  async presentBrowserSession(
    input: PresentBrowserSessionInput,
  ): Promise<ValidatedBrowserSessionBinding> {
    const current = await this.sessionStore.getBrowserSession(
      input.deploymentId,
      input.sessionId,
    );
    if (
      current?.deploymentId !== input.deploymentId ||
      current.threadId !== input.threadId
    ) {
      throw this.externalAccessDenied();
    }
    try {
      validateBrowserSession(current);
    } catch {
      throw this.externalAccessDenied();
    }
    const bearerMatches = await this.sessionSecrets
      .matches(input.bearer, current.verifierDigest)
      .catch(() => false);
    const at = this.currentTime();
    if (!bearerMatches || !isBrowserSessionActiveAt(current, at)) {
      throw this.externalAccessDenied();
    }

    const next = recordBrowserSessionActivity(current, current.version, at);
    try {
      await this.sessionStore.commit({
        kind: "UPDATE_SESSION",
        update: {
          expectedVersion: current.version,
          session: next,
        },
      });
    } catch {
      throw this.externalAccessDenied();
    }

    return new ValidatedBrowserSessionBinding(bindingToken, {
      deploymentId: next.deploymentId,
      threadId: next.threadId,
      accessGrantId: next.accessGrantId,
      sessionId: next.sessionId,
      sessionVersion: next.version,
      validatedAt: at,
    });
  }

  async logoutBrowserSession(input: LogoutBrowserSessionInput): Promise<void> {
    const current = await this.sessionStore.getBrowserSession(
      input.deploymentId,
      input.sessionId,
    );
    if (
      current?.deploymentId !== input.deploymentId ||
      current.threadId !== input.threadId
    ) {
      throw this.externalAccessDenied();
    }
    const bearerMatches = await this.sessionSecrets
      .matches(input.bearer, current.verifierDigest)
      .catch(() => false);
    if (!bearerMatches) {
      throw this.externalAccessDenied();
    }
    if (current.invalidatedAt !== undefined) {
      return;
    }
    const at = this.currentTime();
    const next = invalidateBrowserSession(
      current,
      current.version,
      at,
      "LOGOUT",
    );
    try {
      await this.sessionStore.commit({
        kind: "UPDATE_SESSION",
        update: {
          expectedVersion: current.version,
          session: next,
        },
      });
    } catch {
      throw this.externalAccessDenied();
    }
  }

  private async buildChallenge(
    input: IssueBootstrapChallengeInput,
    grant: AccessGrant,
    issuedAt: string,
  ): Promise<{
    readonly record: BootstrapChallenge;
    readonly result: IssuedBootstrapChallenge;
  }> {
    if (
      !Number.isSafeInteger(input.requestedLifetimeSeconds) ||
      input.requestedLifetimeSeconds <= 0 ||
      input.requestedLifetimeSeconds > BOOTSTRAP_MAX_LIFETIME_SECONDS
    ) {
      throw this.externalAccessDenied();
    }
    const expiresAtMs = Math.min(
      Date.parse(issuedAt) + input.requestedLifetimeSeconds * 1_000,
      Date.parse(grant.expiresAt),
    );
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.parse(issuedAt)) {
      throw this.externalAccessDenied();
    }
    const proofMaterial = await this.proofs.issue();
    const record = validateBootstrapChallenge({
      bootstrapId: this.idGenerator.generate("bootstrap"),
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      accessGrantId: input.accessGrantId,
      verificationMode: input.verificationMode,
      proofVerifierDigest: proofMaterial.verifierDigest,
      proofVerifierAlgorithm: "HMAC-SHA-256",
      proofVerifierVersion: 1,
      issuedAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      failedAttempts: 0,
      maxAttempts: BOOTSTRAP_MAX_ATTEMPTS,
      generation: 1,
      version: 1,
    });
    return {
      record,
      result: {
        bootstrapId: record.bootstrapId,
        proof: proofMaterial.proof,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        generation: record.generation,
      },
    };
  }

  private async recordFailedProof(
    challenge: BootstrapChallenge,
    at: string,
  ): Promise<void> {
    const next = recordBootstrapFailure(
      challenge,
      challenge.version,
      challenge.generation,
      at,
    );
    try {
      await this.sessionStore.commit({
        kind: "UPDATE_CHALLENGE",
        update: {
          expectedVersion: challenge.version,
          expectedGeneration: challenge.generation,
          challenge: next,
        },
      });
    } catch {
      throw this.externalAccessDenied();
    }
  }

  private async invalidateChallengeForGrantFailure(
    challenge: BootstrapChallenge,
    at: string,
  ): Promise<void> {
    if (challenge.consumedAt !== undefined || challenge.invalidatedAt !== undefined) {
      return;
    }
    const next = invalidateBootstrapChallenge(
      challenge,
      challenge.version,
      challenge.generation,
      at,
      "ACCESS_GRANT_INVALID",
    );
    await this.sessionStore.commit({
      kind: "UPDATE_CHALLENGE",
      update: {
        expectedVersion: challenge.version,
        expectedGeneration: challenge.generation,
        challenge: next,
      },
    });
  }

  private async loadCurrentGrantTarget(input: {
    readonly deploymentId: DeploymentId;
    readonly threadId: ThreadId;
    readonly accessGrantId: AccessGrantId;
  }): Promise<CurrentGrantTarget> {
    const grant = await this.workflowStore.getAccessGrant(
      input.deploymentId,
      input.accessGrantId,
    );
    if (
      grant?.deploymentId !== input.deploymentId ||
      grant.threadId !== input.threadId
    ) {
      throw this.externalAccessDenied();
    }
    try {
      validateAccessGrant(grant);
    } catch {
      throw this.externalAccessDenied();
    }
    const now = Date.parse(this.currentTime());
    if (
      grant.revokedAt !== undefined ||
      !Number.isFinite(now) ||
      now >= Date.parse(grant.expiresAt)
    ) {
      throw this.externalAccessDenied();
    }
    const thread = await this.workflowStore.getThread(
      input.deploymentId,
      input.threadId,
    );
    if (
      thread?.deploymentId !== input.deploymentId ||
      thread.threadId !== grant.threadId ||
      !isExternalAccessThreadEligible(thread.state) ||
      !grant.permittedOperations.some(
        (operation) =>
          operation !== "THREAD_REPLY" || isExternalReplyAllowed(thread.state),
      )
    ) {
      throw this.externalAccessDenied();
    }
    return { grant, thread };
  }

  private async confirmGrantTargetUnchanged(
    expected: CurrentGrantTarget,
    at: string,
  ): Promise<void> {
    const currentGrant = await this.workflowStore.getAccessGrant(
      expected.grant.deploymentId,
      expected.grant.grantId,
    );
    const currentThread = await this.workflowStore.getThread(
      expected.thread.deploymentId,
      expected.thread.threadId,
    );
    if (
      currentGrant?.version !== expected.grant.version ||
      currentGrant.revokedAt !== undefined ||
      Date.parse(at) >= Date.parse(currentGrant.expiresAt) ||
      currentThread?.version !== expected.thread.version ||
      !isExternalAccessThreadEligible(currentThread.state)
    ) {
      throw this.externalAccessDenied();
    }
  }

  private normalizeExpectedOrigin(value: string): string {
    try {
      const parsed = new URL(value);
      if (
        parsed.origin !== value ||
        (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      ) {
        throw new Error("Non-canonical origin.");
      }
      return parsed.origin;
    } catch {
      throw this.externalAccessDenied();
    }
  }

  private currentTime(): string {
    const now = this.clock.now();
    if (!Number.isFinite(Date.parse(now))) {
      throw new Error("Clock returned an invalid timestamp.");
    }
    return now;
  }

  private externalAccessDenied(): ApplicationError {
    return new ApplicationError(
      "EXTERNAL_ACCESS_DENIED",
      "External access is not available for the presented authority.",
    );
  }
}
