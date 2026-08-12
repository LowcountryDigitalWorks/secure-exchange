import type { ProtectedContentRef } from "../domain/index.js";
import type { ProtectedContentStore } from "../application/protected-content.js";

export class InMemoryProtectedContentStore implements ProtectedContentStore {
  private readonly content = new Map<ProtectedContentRef, Uint8Array>();
  private failPutRequested = false;
  private failGetRequested = false;
  private failDeleteRequested = false;

  put(contentRef: ProtectedContentRef, bytes: Uint8Array): Promise<void> {
    return Promise.resolve().then(() => {
      if (this.failPutRequested) {
        this.failPutRequested = false;
        throw new Error("Synthetic protected-content write failure.");
      }
      if (this.content.has(contentRef)) {
        throw new Error("Protected-content reference already exists.");
      }
      this.content.set(contentRef, new Uint8Array(bytes));
    });
  }

  get(contentRef: ProtectedContentRef): Promise<Uint8Array | undefined> {
    return Promise.resolve().then(() => {
      if (this.failGetRequested) {
        this.failGetRequested = false;
        throw new Error("Synthetic protected-content read failure.");
      }
      const value = this.content.get(contentRef);
      return value === undefined ? undefined : new Uint8Array(value);
    });
  }

  delete(contentRef: ProtectedContentRef): Promise<void> {
    return Promise.resolve().then(() => {
      if (this.failDeleteRequested) {
        this.failDeleteRequested = false;
        throw new Error("Synthetic protected-content delete failure.");
      }
      this.content.delete(contentRef);
    });
  }

  has(contentRef: ProtectedContentRef): boolean {
    return this.content.has(contentRef);
  }

  get count(): number {
    return this.content.size;
  }

  failNextPut(): void {
    this.failPutRequested = true;
  }

  failNextGet(): void {
    this.failGetRequested = true;
  }

  failNextDelete(): void {
    this.failDeleteRequested = true;
  }
}
