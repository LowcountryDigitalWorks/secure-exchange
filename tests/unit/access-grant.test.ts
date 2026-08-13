import { describe, expect, it } from "vitest";

import {
  isExternalAccessThreadEligible,
  revokeAccessGrant,
  validateAccessGrant,
  validateAccessGrantPolicy,
  type AccessGrant,
  type AccessGrantPolicy,
} from "../../src/domain/access-grant.js";
import { DomainError } from "../../src/domain/errors.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";

const POLICY: AccessGrantPolicy = {
  policyRef: "access-policy-a-v1",
  deploymentId: "deployment-a",
  maxLifetimeSeconds: 3_600,
  allowedOperations: ["THREAD_READ"],
};

function grant(overrides: Partial<AccessGrant> = {}): AccessGrant {
  return {
    grantId: "grant-a",
    deploymentId: "deployment-a",
    threadId: "thread-a",
    externalParticipantRef: "external-a",
    policyRef: POLICY.policyRef,
    verifierDigest: `sha256:v1:${"A".repeat(43)}`,
    permittedOperations: ["THREAD_READ"],
    issuedAt: "2026-08-13T01:00:00.000Z",
    expiresAt: "2026-08-13T02:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function expectDomainCode(
  action: () => unknown,
  code: DomainError["code"],
): void {
  try {
    action();
    throw new Error("Expected domain error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

describe("AccessGrant domain model", () => {
  it("validates bounded policy and grant metadata", () => {
    expect(validateAccessGrantPolicy(POLICY)).toBe(POLICY);
    const item = grant();
    expect(validateAccessGrant(item)).toBe(item);
  });

  it("rejects duplicate or invalid operation policy", () => {
    expectDomainCode(
      () =>
        validateAccessGrantPolicy({
          ...POLICY,
          allowedOperations: ["THREAD_READ", "THREAD_READ"],
        }),
      "INVALID_ACCESS_GRANT_POLICY",
    );
  });

  it("keeps external access separate from thread lifecycle transitions", () => {
    for (const state of [
      "NEW",
      "IN_PROGRESS",
      "AWAITING_EXTERNAL",
      "AWAITING_STAFF",
      "COMPLETED",
    ] as const) {
      expect(isExternalAccessThreadEligible(state)).toBe(true);
    }
    expect(isExternalAccessThreadEligible("EXPIRED")).toBe(false);
    expect(isExternalAccessThreadEligible("DISPOSED")).toBe(false);
  });

  it("revokes with optimistic versioning and treats replay as idempotent", () => {
    const revoked = revokeAccessGrant(
      grant(),
      1,
      "2026-08-13T01:15:00.000Z",
    );
    expect(revoked).toMatchObject({
      revokedAt: "2026-08-13T01:15:00.000Z",
      version: 2,
    });
    expect(
      revokeAccessGrant(revoked, 1, "2026-08-13T01:20:00.000Z"),
    ).toBe(revoked);
  });

  it("rejects stale first-time revocation", () => {
    expectDomainCode(
      () =>
        revokeAccessGrant(grant(), 9, "2026-08-13T01:15:00.000Z"),
      "STALE_VERSION",
    );
  });
});

describe("Web Crypto AccessGrant secret manager", () => {
  it("issues high-entropy one-time secret material and persists only a digest form", async () => {
    const manager = new WebCryptoAccessGrantSecretManager();
    const first = await manager.issue();
    const second = await manager.issue();

    expect(first.secret).toMatch(/^sxg1_[A-Za-z0-9_-]{43}$/u);
    expect(first.verifierDigest).toMatch(/^sha256:v1:[A-Za-z0-9_-]{43}$/u);
    expect(first.secret).not.toBe(second.secret);
    expect(first.verifierDigest).not.toBe(first.secret);
    await expect(manager.matches(first.secret, first.verifierDigest)).resolves.toBe(
      true,
    );
    await expect(manager.matches(second.secret, first.verifierDigest)).resolves.toBe(
      false,
    );
  });
});
