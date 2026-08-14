import type { BootstrapId } from "../domain/types.js";

export interface IssuedBootstrapProof {
  readonly proof: string;
  readonly verifierDigest: string;
}

export interface BootstrapProofManager {
  issue(): Promise<IssuedBootstrapProof>;
  matches(proof: string, verifierDigest: string): Promise<boolean>;
}

export interface IssuedBrowserSessionSecret {
  readonly bearer: string;
  readonly verifierDigest: string;
}

export interface BrowserSessionSecretManager {
  issue(): Promise<IssuedBrowserSessionSecret>;
  matches(bearer: string, verifierDigest: string): Promise<boolean>;
}

export interface BootstrapFormGuardIssueInput {
  readonly bootstrapId: BootstrapId;
  readonly generation: number;
  readonly origin: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface BootstrapFormGuardValidationInput {
  readonly bootstrapId: BootstrapId;
  readonly generation: number;
  readonly origin: string;
  readonly at: string;
}

export interface IssuedBootstrapFormGuard {
  readonly guard: string;
  readonly expiresAt: string;
}

export interface BootstrapFormGuardManager {
  issue(input: BootstrapFormGuardIssueInput): Promise<IssuedBootstrapFormGuard>;
  matches(
    guard: string,
    input: BootstrapFormGuardValidationInput,
  ): Promise<boolean>;
}
