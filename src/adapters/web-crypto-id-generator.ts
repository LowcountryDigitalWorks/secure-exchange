import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../application/id-generator.js";

export class WebCryptoOpaqueIdGenerator implements OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string {
    void purpose;
    return globalThis.crypto.randomUUID();
  }
}
