import type {
  AccessGrantId,
  BootstrapChallenge,
  BootstrapId,
  BrowserSession,
  BrowserSessionId,
  DeploymentId,
} from "../domain/index.js";

export interface BootstrapChallengeUpdate {
  readonly expectedVersion: number;
  readonly expectedGeneration: number;
  readonly challenge: BootstrapChallenge;
}

export interface BootstrapSessionExchange {
  readonly expectedChallengeVersion: number;
  readonly expectedChallengeGeneration: number;
  readonly consumedChallenge: BootstrapChallenge;
  readonly newSession: BrowserSession;
  readonly replacementAt: string;
}

export interface BrowserSessionUpdate {
  readonly expectedVersion: number;
  readonly session: BrowserSession;
}

export interface ExternalDeliveryReissue {
  readonly deploymentId: DeploymentId;
  readonly accessGrantId: AccessGrantId;
  readonly invalidatedAt: string;
  readonly newChallenge: BootstrapChallenge;
}

export type ExternalSessionMutation =
  | {
      readonly kind: "CREATE_CHALLENGE";
      readonly challenge: BootstrapChallenge;
    }
  | {
      readonly kind: "UPDATE_CHALLENGE";
      readonly update: BootstrapChallengeUpdate;
    }
  | {
      readonly kind: "EXCHANGE_CHALLENGE";
      readonly exchange: BootstrapSessionExchange;
    }
  | {
      readonly kind: "UPDATE_SESSION";
      readonly update: BrowserSessionUpdate;
    }
  | {
      readonly kind: "REISSUE";
      readonly reissue: ExternalDeliveryReissue;
    };

export interface ExternalSessionStore {
  getBootstrapChallenge(
    deploymentId: DeploymentId,
    bootstrapId: BootstrapId,
  ): Promise<BootstrapChallenge | undefined>;

  listBootstrapChallengesForAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<readonly BootstrapChallenge[]>;

  getBrowserSession(
    deploymentId: DeploymentId,
    sessionId: BrowserSessionId,
  ): Promise<BrowserSession | undefined>;

  listBrowserSessionsForAccessGrant(
    deploymentId: DeploymentId,
    accessGrantId: AccessGrantId,
  ): Promise<readonly BrowserSession[]>;

  commit(mutation: ExternalSessionMutation): Promise<void>;
}
