import type {
  BootstrapFormGuardIssueInput,
  BootstrapFormGuardManager,
  BootstrapFormGuardValidationInput,
  BootstrapProofManager,
  BrowserSessionSecretManager,
  IssuedBootstrapFormGuard,
  IssuedBootstrapProof,
  IssuedBrowserSessionSecret,
} from "../application/external-session-security.js";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BOOTSTRAP_PROOF_PATTERN = /^sxp1_[A-Za-z0-9_-]{11}$/u;
const BOOTSTRAP_VERIFIER_PATTERN = /^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/u;
const SESSION_BEARER_PATTERN = /^sxs1_[A-Za-z0-9_-]{43}$/u;
const SESSION_VERIFIER_PATTERN = /^sha256:v1:[A-Za-z0-9_-]{43}$/u;
const GUARD_PREFIX = "sxfg1_";

function base64UrlEncode(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;

    result += BASE64URL_ALPHABET[first >> 2];
    result += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    if (index + 1 < bytes.length) {
      result += BASE64URL_ALPHABET[((second & 0x0f) << 2) | (third >> 6)];
    }
    if (index + 2 < bytes.length) {
      result += BASE64URL_ALPHABET[third & 0x3f];
    }
  }
  return result;
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value.");
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    const index = BASE64URL_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid base64url value.");
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function copyKey(keyMaterial: Uint8Array): Uint8Array {
  if (keyMaterial.byteLength < 32) {
    throw new Error("Synthetic HMAC key material must be at least 256 bits.");
  }
  return new Uint8Array(keyMaterial);
}

async function importHmacKey(keyMaterial: Uint8Array): Promise<CryptoKey> {
  const ownedKeyMaterial = Uint8Array.from(keyMaterial);
  return globalThis.crypto.subtle.importKey(
    "raw",
    ownedKeyMaterial.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmacDigest(
  keyMaterial: Uint8Array,
  value: string,
): Promise<string> {
  const key = await importHmacKey(keyMaterial);
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

async function sha256Digest(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export class WebCryptoBootstrapProofManager implements BootstrapProofManager {
  private readonly keyMaterial: Uint8Array;

  constructor(keyMaterial: Uint8Array) {
    this.keyMaterial = copyKey(keyMaterial);
  }

  async issue(): Promise<IssuedBootstrapProof> {
    const proof = `sxp1_${randomBase64Url(8)}`;
    return {
      proof,
      verifierDigest: `hmac-sha256:v1:${await hmacDigest(this.keyMaterial, proof)}`,
    };
  }

  async matches(proof: string, verifierDigest: string): Promise<boolean> {
    if (
      !BOOTSTRAP_PROOF_PATTERN.test(proof) ||
      !BOOTSTRAP_VERIFIER_PATTERN.test(verifierDigest)
    ) {
      return false;
    }
    const candidate = `hmac-sha256:v1:${await hmacDigest(
      this.keyMaterial,
      proof,
    )}`;
    return constantTimeEqual(candidate, verifierDigest);
  }
}

export class WebCryptoBrowserSessionSecretManager implements BrowserSessionSecretManager {
  async issue(): Promise<IssuedBrowserSessionSecret> {
    const bearer = `sxs1_${randomBase64Url(32)}`;
    return {
      bearer,
      verifierDigest: `sha256:v1:${await sha256Digest(bearer)}`,
    };
  }

  async matches(bearer: string, verifierDigest: string): Promise<boolean> {
    if (
      !SESSION_BEARER_PATTERN.test(bearer) ||
      !SESSION_VERIFIER_PATTERN.test(verifierDigest)
    ) {
      return false;
    }
    const candidate = `sha256:v1:${await sha256Digest(bearer)}`;
    return constantTimeEqual(candidate, verifierDigest);
  }
}

interface GuardClaims {
  readonly version: 1;
  readonly bootstrapId: string;
  readonly generation: number;
  readonly origin: string;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

function parseGuardClaims(encoded: string): GuardClaims {
  const parsed: unknown = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(encoded)),
  );
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid guard claims.");
  }
  const value = parsed as Record<string, unknown>;
  if (
    value["version"] !== 1 ||
    typeof value["bootstrapId"] !== "string" ||
    !Number.isSafeInteger(value["generation"]) ||
    typeof value["origin"] !== "string" ||
    typeof value["nonce"] !== "string" ||
    typeof value["issuedAt"] !== "string" ||
    typeof value["expiresAt"] !== "string"
  ) {
    throw new Error("Invalid guard claims.");
  }
  return {
    version: 1,
    bootstrapId: value["bootstrapId"],
    generation: value["generation"] as number,
    origin: value["origin"],
    nonce: value["nonce"],
    issuedAt: value["issuedAt"],
    expiresAt: value["expiresAt"],
  };
}

export class WebCryptoBootstrapFormGuardManager implements BootstrapFormGuardManager {
  private readonly keyMaterial: Uint8Array;

  constructor(keyMaterial: Uint8Array) {
    this.keyMaterial = copyKey(keyMaterial);
  }

  async issue(
    input: BootstrapFormGuardIssueInput,
  ): Promise<IssuedBootstrapFormGuard> {
    const issuedAt = Date.parse(input.issuedAt);
    const expiresAt = Date.parse(input.expiresAt);
    if (
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= issuedAt ||
      !Number.isSafeInteger(input.generation) ||
      input.generation <= 0
    ) {
      throw new Error("Bootstrap form guard timing or generation is invalid.");
    }

    const claims: GuardClaims = {
      version: 1,
      bootstrapId: input.bootstrapId,
      generation: input.generation,
      origin: input.origin,
      nonce: randomBase64Url(16),
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    };
    const payload = base64UrlEncode(
      new TextEncoder().encode(JSON.stringify(claims)),
    );
    const signature = await hmacDigest(this.keyMaterial, payload);
    return {
      guard: `${GUARD_PREFIX}${payload}.${signature}`,
      expiresAt: input.expiresAt,
    };
  }

  async matches(
    guard: string,
    input: BootstrapFormGuardValidationInput,
  ): Promise<boolean> {
    try {
      if (!guard.startsWith(GUARD_PREFIX)) {
        return false;
      }
      const [payload, signature, extra] = guard
        .slice(GUARD_PREFIX.length)
        .split(".");
      if (
        payload === undefined ||
        signature === undefined ||
        extra !== undefined ||
        signature.length !== 43
      ) {
        return false;
      }
      const expectedSignature = await hmacDigest(this.keyMaterial, payload);
      if (!constantTimeEqual(signature, expectedSignature)) {
        return false;
      }
      const claims = parseGuardClaims(payload);
      const at = Date.parse(input.at);
      const issuedAt = Date.parse(claims.issuedAt);
      const expiresAt = Date.parse(claims.expiresAt);
      return (
        claims.bootstrapId === input.bootstrapId &&
        claims.generation === input.generation &&
        claims.origin === input.origin &&
        Number.isFinite(at) &&
        Number.isFinite(issuedAt) &&
        Number.isFinite(expiresAt) &&
        at >= issuedAt &&
        at < expiresAt
      );
    } catch {
      return false;
    }
  }
}
