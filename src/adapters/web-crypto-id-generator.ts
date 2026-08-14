import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../application/id-generator.js";

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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

function randomOpaqueId(prefix: string): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}${base64UrlEncode(bytes)}`;
}

export class WebCryptoOpaqueIdGenerator implements OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string {
    if (purpose === "bootstrap") {
      return randomOpaqueId("sxb1_");
    }
    if (purpose === "browser-session") {
      return randomOpaqueId("sxsid1_");
    }
    return globalThis.crypto.randomUUID();
  }
}
