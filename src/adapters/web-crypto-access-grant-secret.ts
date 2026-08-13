import type {
  AccessGrantSecretManager,
  IssuedAccessGrantSecret,
} from "../application/access-grant-secret.js";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SECRET_PATTERN = /^sxg1_[A-Za-z0-9_-]{43}$/u;
const VERIFIER_PREFIX = "sha256:v1:";
const VERIFIER_PATTERN = /^sha256:v1:[A-Za-z0-9_-]{43}$/u;

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

async function digestSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `${VERIFIER_PREFIX}${base64UrlEncode(new Uint8Array(digest))}`;
}

export class WebCryptoAccessGrantSecretManager
  implements AccessGrantSecretManager
{
  async issue(): Promise<IssuedAccessGrantSecret> {
    const randomBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randomBytes);
    const secret = `sxg1_${base64UrlEncode(randomBytes)}`;
    return {
      secret,
      verifierDigest: await digestSecret(secret),
    };
  }

  async matches(secret: string, verifierDigest: string): Promise<boolean> {
    if (!SECRET_PATTERN.test(secret) || !VERIFIER_PATTERN.test(verifierDigest)) {
      return false;
    }
    const candidate = await digestSecret(secret);
    return constantTimeEqual(candidate, verifierDigest);
  }
}
