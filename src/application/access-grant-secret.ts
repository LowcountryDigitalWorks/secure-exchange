export interface IssuedAccessGrantSecret {
  readonly secret: string;
  readonly verifierDigest: string;
}

export interface AccessGrantSecretManager {
  issue(): Promise<IssuedAccessGrantSecret>;
  matches(secret: string, verifierDigest: string): Promise<boolean>;
}
