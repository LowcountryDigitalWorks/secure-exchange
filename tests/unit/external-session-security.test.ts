import { describe, expect, it } from "vitest";

import {
  WebCryptoBootstrapFormGuardManager,
  WebCryptoBootstrapProofManager,
  WebCryptoBrowserSessionSecretManager,
} from "../../src/adapters/web-crypto-external-session-security.js";
import { WebCryptoOpaqueIdGenerator } from "../../src/adapters/web-crypto-id-generator.js";

function syntheticKey(offset: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (index + offset) % 256);
}

describe("Release 0.13 external session cryptographic boundaries", () => {
  it("generates high-entropy bootstrap locators without changing existing ID purposes", () => {
    const ids = new WebCryptoOpaqueIdGenerator();
    const first = ids.generate("bootstrap");
    const second = ids.generate("bootstrap");

    expect(first).toMatch(/^sxb1_[A-Za-z0-9_-]{27}$/u);
    expect(second).toMatch(/^sxb1_[A-Za-z0-9_-]{27}$/u);
    expect(second).not.toBe(first);
    expect(ids.generate("thread")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("uses a keyed verifier for the lower-entropy one-time bootstrap proof", async () => {
    const manager = new WebCryptoBootstrapProofManager(syntheticKey(1));
    const otherKey = new WebCryptoBootstrapProofManager(syntheticKey(97));
    const issued = await manager.issue();

    expect(issued.proof).toMatch(/^sxp1_[A-Za-z0-9_-]{11}$/u);
    expect(issued.verifierDigest).toMatch(
      /^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u,
    );
    await expect(
      manager.matches(issued.proof, issued.verifierDigest),
    ).resolves.toBe(true);
    await expect(
      otherKey.matches(issued.proof, issued.verifierDigest),
    ).resolves.toBe(false);
    await expect(
      manager.matches("sxp1_AAAAAAAAAAA", issued.verifierDigest),
    ).resolves.toBe(false);
  });

  it("creates a fresh 256-bit browser bearer and persists only its SHA-256 verifier", async () => {
    const manager = new WebCryptoBrowserSessionSecretManager();
    const issued = await manager.issue();

    expect(issued.bearer).toMatch(/^sxs1_[A-Za-z0-9_-]{43}$/u);
    expect(issued.verifierDigest).toMatch(/^sha256:v1:[A-Za-z0-9_-]{43}$/u);
    expect(issued.verifierDigest).not.toBe(issued.bearer);
    await expect(
      manager.matches(issued.bearer, issued.verifierDigest),
    ).resolves.toBe(true);
    const wrong = await manager.issue();
    await expect(
      manager.matches(wrong.bearer, issued.verifierDigest),
    ).resolves.toBe(false);
  });

  it("authenticates BootstrapFormGuard challenge, generation, origin, nonce and exact expiry", async () => {
    const manager = new WebCryptoBootstrapFormGuardManager(syntheticKey(33));
    const issued = await manager.issue({
      bootstrapId: "bootstrap-synthetic",
      generation: 4,
      origin: "https://secure.example.test",
      issuedAt: "2026-08-14T12:00:00.000Z",
      expiresAt: "2026-08-14T12:10:00.000Z",
    });
    const second = await manager.issue({
      bootstrapId: "bootstrap-synthetic",
      generation: 4,
      origin: "https://secure.example.test",
      issuedAt: "2026-08-14T12:00:00.000Z",
      expiresAt: "2026-08-14T12:10:00.000Z",
    });

    expect(second.guard).not.toBe(issued.guard);
    await expect(
      manager.matches(issued.guard, {
        bootstrapId: "bootstrap-synthetic",
        generation: 4,
        origin: "https://secure.example.test",
        at: "2026-08-14T12:09:59.999Z",
      }),
    ).resolves.toBe(true);
    for (const mismatch of [
      {
        bootstrapId: "bootstrap-other",
        generation: 4,
        origin: "https://secure.example.test",
      },
      {
        bootstrapId: "bootstrap-synthetic",
        generation: 5,
        origin: "https://secure.example.test",
      },
      {
        bootstrapId: "bootstrap-synthetic",
        generation: 4,
        origin: "https://evil.example.test",
      },
    ] as const) {
      await expect(
        manager.matches(issued.guard, {
          ...mismatch,
          at: "2026-08-14T12:05:00.000Z",
        }),
      ).resolves.toBe(false);
    }
    await expect(
      manager.matches(issued.guard, {
        bootstrapId: "bootstrap-synthetic",
        generation: 4,
        origin: "https://secure.example.test",
        at: "2026-08-14T12:10:00.000Z",
      }),
    ).resolves.toBe(false);
  });
});
