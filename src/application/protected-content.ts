import type { ProtectedContentRef } from "../domain/index.js";

export interface ProtectedContentStore {
  put(contentRef: ProtectedContentRef, content: Uint8Array): Promise<void>;
  get(contentRef: ProtectedContentRef): Promise<Uint8Array | undefined>;
  delete(contentRef: ProtectedContentRef): Promise<void>;
}
