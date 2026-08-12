import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../application/id-generator.js";

export class WebCryptoOpaqueIdGenerator implements OpaqueIdGenerator {
  generate(_purpose: OpaqueIdPurpose): string {
    return globalThis.crypto.randomUUID();
  }
}
