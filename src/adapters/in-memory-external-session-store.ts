import { DomainError } from "../domain/errors.js";
import {
  invalidateBootstrapChallenge,
  invalidateBrowserSession,
  validateBootstrapChallenge,
  validateBrowserSession,
  type AccessGrantId,
  type BootstrapChallenge,
  type BootstrapId,
  type BrowserSession,
  type BrowserSessionId,
  type DeploymentId,
} from "../domain/index.js";
import type {
  BootstrapChallengeUpdate,
  BootstrapSessionExchange,
  BrowserSessionUpdate,
  ExternalDeliveryReissue,
  ExternalSessionMutation,
  ExternalSessionStore,
} from "../application/external-session-store.js";

export interface InMemoryExternalSessionSeed {
  readonly bootstrapChallenges?: readonly BootstrapChallenge[];
  readonly browserSessions?: readonly BrowserSession[];
}

function resourceKey(deploymentId: string, resourceId: string): string {
  return `${deploymentId}\u0000${resourceId}`;
}

function isOutstandingChallenge(challenge: BootstrapChallenge): boolean {
  return (
    challenge.consumedAt === undefined && challenge.invalidatedAt === undefined
  );
}

function isActiveSession(session: BrowserSession): boolean {
  return session.invalidatedAt === undefined;
}

export class InMemoryExternalSessionStore implements ExternalSessionStore {
  private bootstrapChallenges: Map<string, BootstrapChallenge>;
  private browserSessions: Map<string, BrowserSession>;
  private failNextCommitRequested = false;

  constructor(seed: InMemoryExternalSessionSeed = {}) {
    this.bootstrapChallenges = new Map(
      (seed.bootstrapChallenges ?? []).map((challenge) => {
        const validated = validateBootstrapChallenge(challenge);
        return [
          resourceKey(validated.deploymentId, validated.bootstrapId),
          validated,
        ];
      }),
    );
    this.browserSessions = new Map(
      (seed.browserSessions ?? []).map((session) => {
        const validated = validateBrowserSession(session);
        return [
          resourceKey(validated.deploymentId, validated.sessionId),
          validated,
        ];
      }),
    );
  }

  getBootstrapChallenge(
    deploymentId: DeploymentId,
    bootstrapId: BootstrapId,
  ): Promise<BootstrapChallenge | undefined> {
    return Promise.resolve(
      this.bootstrapChallenges.get(resourceKey(deploymentId, bootstrapId)),
    );
  }

  listBootstrapChallengesForAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<readonly BootstrapChallenge[]> {
    return Promise.resolve(
      [...this.bootstrapChallenges.values()].filter(
        (challenge) =>
          challenge.deploymentId === deploymentId &&
          challenge.accessGrantId === accessGrantId,
      ),
    );
  }

  getBrowserSession(
    deploymentId: DeploymentId,
    sessionId: BrowserSessionId,
  ): Promise<BrowserSession | undefined> {
    return Promise.resolve(
      this.browserSessions.get(resourceKey(deploymentId, sessionId)),
    );
  }

  listBrowserSessionsForAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<readonly BrowserSession[]> {
    return Promise.resolve(
      [...this.browserSessions.values()].filter(
        (session) =>
          session.deploymentId === deploymentId &&
          session.accessGrantId === accessGrantId,
      ),
    );
  }

  failNextCommit(): void {
    this.failNextCommitRequested = true;
  }

  commit(mutation: ExternalSessionMutation): Promise<void> {
    return Promise.resolve().then(() => {
      const nextChallenges = new Map(this.bootstrapChallenges);
      const nextSessions = new Map(this.browserSessions);

      switch (mutation.kind) {
        case "CREATE_CHALLENGE":
          this.createChallenge(
            nextChallenges,
            nextSessions,
            mutation.challenge,
          );
          break;
        case "UPDATE_CHALLENGE":
          this.updateChallenge(nextChallenges, mutation.update);
          break;
        case "EXCHANGE_CHALLENGE":
          this.exchangeChallenge(
            nextChallenges,
            nextSessions,
            mutation.exchange,
          );
          break;
        case "UPDATE_SESSION":
          this.updateSession(nextSessions, mutation.update);
          break;
        case "REISSUE":
          this.reissue(nextChallenges, nextSessions, mutation.reissue);
          break;
      }

      if (this.failNextCommitRequested) {
        this.failNextCommitRequested = false;
        throw new Error("Synthetic external-session transaction failure.");
      }

      this.bootstrapChallenges = nextChallenges;
      this.browserSessions = nextSessions;
    });
  }

  private createChallenge(
    challenges: Map<string, BootstrapChallenge>,
    sessions: ReadonlyMap<string, BrowserSession>,
    challenge: BootstrapChallenge,
  ): void {
    const validated = validateBootstrapChallenge(challenge);
    const key = resourceKey(validated.deploymentId, validated.bootstrapId);
    if (challenges.has(key)) {
      throw new DomainError(
        "BOOTSTRAP_AUTHORITY_CHANGED",
        "Bootstrap identifier already exists.",
      );
    }
    if (
      validated.version !== 1 ||
      validated.generation !== 1 ||
      validated.failedAttempts !== 0 ||
      validated.consumedAt !== undefined ||
      validated.invalidatedAt !== undefined
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "New bootstrap challenge must start in its initial state.",
      );
    }
    const activeChallenge = [...challenges.values()].some(
      (item) =>
        item.deploymentId === validated.deploymentId &&
        item.accessGrantId === validated.accessGrantId &&
        isOutstandingChallenge(item),
    );
    const activeSession = [...sessions.values()].some(
      (item) =>
        item.deploymentId === validated.deploymentId &&
        item.accessGrantId === validated.accessGrantId &&
        isActiveSession(item),
    );
    if (activeChallenge || activeSession) {
      throw new DomainError(
        "BOOTSTRAP_AUTHORITY_CHANGED",
        "Active external delivery state already exists for the AccessGrant.",
      );
    }
    challenges.set(key, validated);
  }

  private updateChallenge(
    challenges: Map<string, BootstrapChallenge>,
    update: BootstrapChallengeUpdate,
  ): void {
    const next = validateBootstrapChallenge(update.challenge);
    const key = resourceKey(next.deploymentId, next.bootstrapId);
    const current = challenges.get(key);
    if (
      current?.version !== update.expectedVersion ||
      current?.generation !== update.expectedGeneration
    ) {
      throw new DomainError(
        "BOOTSTRAP_AUTHORITY_CHANGED",
        "Bootstrap challenge changed before the transaction committed.",
      );
    }
    this.requireChallengeImmutableFields(current, next);
    if (
      next.version !== current.version + 1 ||
      next.generation !== current.generation + 1
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Bootstrap challenge version and generation must advance exactly once.",
      );
    }
    challenges.set(key, next);
  }

  private exchangeChallenge(
    challenges: Map<string, BootstrapChallenge>,
    sessions: Map<string, BrowserSession>,
    exchange: BootstrapSessionExchange,
  ): void {
    const consumed = validateBootstrapChallenge(exchange.consumedChallenge);
    const challengeKey = resourceKey(
      consumed.deploymentId,
      consumed.bootstrapId,
    );
    const current = challenges.get(challengeKey);
    if (
      current?.version !== exchange.expectedChallengeVersion ||
      current?.generation !== exchange.expectedChallengeGeneration ||
      current?.consumedAt !== undefined ||
      current?.invalidatedAt !== undefined
    ) {
      throw new DomainError(
        "BOOTSTRAP_AUTHORITY_CHANGED",
        "Bootstrap challenge changed before exchange committed.",
      );
    }
    this.requireChallengeImmutableFields(current, consumed);
    if (
      consumed.consumedAt === undefined ||
      consumed.invalidatedAt !== undefined ||
      consumed.version !== current.version + 1 ||
      consumed.generation !== current.generation + 1
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Bootstrap exchange did not consume the challenge exactly once.",
      );
    }

    const session = validateBrowserSession(exchange.newSession);
    if (
      session.version !== 1 ||
      session.invalidatedAt !== undefined ||
      session.deploymentId !== consumed.deploymentId ||
      session.threadId !== consumed.threadId ||
      session.accessGrantId !== consumed.accessGrantId
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Browser session does not match the consumed bootstrap challenge.",
      );
    }
    const sessionKey = resourceKey(session.deploymentId, session.sessionId);
    if (sessions.has(sessionKey)) {
      throw new DomainError(
        "BROWSER_SESSION_AUTHORITY_CHANGED",
        "Browser session identifier already exists.",
      );
    }

    for (const [key, candidate] of sessions) {
      if (
        candidate.deploymentId === session.deploymentId &&
        candidate.accessGrantId === session.accessGrantId &&
        isActiveSession(candidate)
      ) {
        sessions.set(
          key,
          invalidateBrowserSession(
            candidate,
            candidate.version,
            exchange.replacementAt,
            "REPLACED",
          ),
        );
      }
    }

    challenges.set(challengeKey, consumed);
    sessions.set(sessionKey, session);
  }

  private updateSession(
    sessions: Map<string, BrowserSession>,
    update: BrowserSessionUpdate,
  ): void {
    const next = validateBrowserSession(update.session);
    const key = resourceKey(next.deploymentId, next.sessionId);
    const current = sessions.get(key);
    if (current?.version !== update.expectedVersion) {
      throw new DomainError(
        "BROWSER_SESSION_AUTHORITY_CHANGED",
        "Browser session changed before the transaction committed.",
      );
    }
    this.requireSessionImmutableFields(current, next);
    if (next.version !== current.version + 1) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Browser session version must advance exactly once.",
      );
    }
    sessions.set(key, next);
  }

  private reissue(
    challenges: Map<string, BootstrapChallenge>,
    sessions: Map<string, BrowserSession>,
    reissue: ExternalDeliveryReissue,
  ): void {
    const nextChallenge = validateBootstrapChallenge(reissue.newChallenge);
    if (
      nextChallenge.deploymentId !== reissue.deploymentId ||
      nextChallenge.accessGrantId !== reissue.accessGrantId ||
      nextChallenge.version !== 1 ||
      nextChallenge.generation !== 1 ||
      nextChallenge.failedAttempts !== 0 ||
      nextChallenge.consumedAt !== undefined ||
      nextChallenge.invalidatedAt !== undefined
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Reissued challenge is outside the requested delivery scope.",
      );
    }
    const challengeKey = resourceKey(
      nextChallenge.deploymentId,
      nextChallenge.bootstrapId,
    );
    if (challenges.has(challengeKey)) {
      throw new DomainError(
        "BOOTSTRAP_AUTHORITY_CHANGED",
        "Reissued bootstrap identifier already exists.",
      );
    }

    for (const [key, challenge] of challenges) {
      if (
        challenge.deploymentId === reissue.deploymentId &&
        challenge.accessGrantId === reissue.accessGrantId &&
        isOutstandingChallenge(challenge)
      ) {
        challenges.set(
          key,
          invalidateBootstrapChallenge(
            challenge,
            challenge.version,
            challenge.generation,
            reissue.invalidatedAt,
            "REISSUED",
          ),
        );
      }
    }

    for (const [key, session] of sessions) {
      if (
        session.deploymentId === reissue.deploymentId &&
        session.accessGrantId === reissue.accessGrantId &&
        isActiveSession(session)
      ) {
        sessions.set(
          key,
          invalidateBrowserSession(
            session,
            session.version,
            reissue.invalidatedAt,
            "REISSUED",
          ),
        );
      }
    }

    challenges.set(challengeKey, nextChallenge);
  }

  private requireChallengeImmutableFields(
    current: BootstrapChallenge,
    next: BootstrapChallenge,
  ): void {
    if (
      next.bootstrapId !== current.bootstrapId ||
      next.deploymentId !== current.deploymentId ||
      next.threadId !== current.threadId ||
      next.accessGrantId !== current.accessGrantId ||
      next.verificationMode !== current.verificationMode ||
      next.proofVerifierDigest !== current.proofVerifierDigest ||
      next.proofVerifierAlgorithm !== current.proofVerifierAlgorithm ||
      next.proofVerifierVersion !== current.proofVerifierVersion ||
      next.issuedAt !== current.issuedAt ||
      next.expiresAt !== current.expiresAt ||
      next.maxAttempts !== current.maxAttempts
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Bootstrap challenge update changed immutable authority metadata.",
      );
    }
  }

  private requireSessionImmutableFields(
    current: BrowserSession,
    next: BrowserSession,
  ): void {
    if (
      next.sessionId !== current.sessionId ||
      next.deploymentId !== current.deploymentId ||
      next.threadId !== current.threadId ||
      next.accessGrantId !== current.accessGrantId ||
      next.verifierDigest !== current.verifierDigest ||
      next.establishedAt !== current.establishedAt ||
      next.absoluteExpiresAt !== current.absoluteExpiresAt
    ) {
      throw new DomainError(
        "INVALID_EXTERNAL_SESSION",
        "Browser session update changed immutable authority metadata.",
      );
    }
  }
}
