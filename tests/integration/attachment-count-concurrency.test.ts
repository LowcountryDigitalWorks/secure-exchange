import { describe, expect, it } from "vitest";

import { AttachmentService } from "../../src/application/attachment-service.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import type { ProtectedContentStore } from "../../src/application/protected-content.js";
import { InMemoryProtectedContentStore } from "../../src/adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import type {
  Attachment,
  AttachmentFilePolicy,
} from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  THREAD_A,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

const MESSAGE_A = "message-1";
const BYTES = new TextEncoder().encode("synthetic concurrent attachment");

class SequenceIdGenerator implements OpaqueIdGenerator {
  private readonly counters = new Map<OpaqueIdPurpose, number>();

  generate(purpose: OpaqueIdPurpose): string {
    const next = (this.counters.get(purpose) ?? 0) + 1;
    this.counters.set(purpose, next);
    return `${purpose}-${next}`;
  }
}

class TwoWriterBarrierContentStore implements ProtectedContentStore {
  private readonly inner = new InMemoryProtectedContentStore();
  private arrivals = 0;
  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async put(contentRef: string, bytes: Uint8Array): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals === 2) {
      this.release();
    }
    await this.gate;
    await this.inner.put(contentRef, bytes);
  }

  get(contentRef: string): Promise<Uint8Array | undefined> {
    return this.inner.get(contentRef);
  }

  delete(contentRef: string): Promise<void> {
    return this.inner.delete(contentRef);
  }

  get count(): number {
    return this.inner.count;
  }
}

function policy(
  overrides: Partial<AttachmentFilePolicy> = {},
): AttachmentFilePolicy {
  return {
    policyRef: "attachment-policy-v1",
    deploymentId: DEPLOYMENT_A,
    maxAttachmentSizeBytes: 1024,
    maxAttachmentsPerMessage: 1,
    allowedMediaCategories: ["DOCUMENT"],
    allowedMediaTypes: ["application/pdf"],
    allowedExtensions: ["pdf"],
    ...overrides,
  };
}

function newAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    attachmentId: "attachment-direct",
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    originalDisplayFilename: "direct.pdf",
    safeDownloadFilename: "direct.pdf",
    normalizedMediaCategory: "DOCUMENT",
    normalizedMediaType: "application/pdf",
    normalizedExtension: "pdf",
    sizeBytes: BYTES.byteLength,
    contentRef: "content-direct",
    state: "QUARANTINED",
    createdAt: "2026-08-13T01:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("authoritative attachment count enforcement", () => {
  it("allows only one of two concurrent ingestions when the message limit is one", async () => {
    const store = new InMemoryWorkflowStore({
      queues: [makeQueue()],
      threads: [makeThread()],
      messages: [makeMessage()],
      attachmentPolicies: [policy()],
    });
    const content = new TwoWriterBarrierContentStore();
    const service = new AttachmentService(
      store,
      content,
      new SequenceIdGenerator(),
      "synthetic-scan-system",
    );

    const results = await Promise.allSettled([
      service.ingestAttachment({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        originalDisplayFilename: "first.pdf",
        declaredMediaCategory: "DOCUMENT",
        declaredMediaType: "application/pdf",
        content: BYTES,
        at: "2026-08-13T01:00:00.000Z",
      }),
      service.ingestAttachment({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        originalDisplayFilename: "second.pdf",
        declaredMediaCategory: "DOCUMENT",
        declaredMediaType: "application/pdf",
        content: BYTES,
        at: "2026-08-13T01:00:00.000Z",
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      await store.listAttachmentsForMessage(DEPLOYMENT_A, THREAD_A, MESSAGE_A),
    ).toHaveLength(1);
    expect(content.count).toBe(1);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toHaveLength(2);
  });

  it("rejects a stale attachment policy reference at the commit boundary", async () => {
    const store = new InMemoryWorkflowStore({
      queues: [makeQueue()],
      threads: [makeThread()],
      messages: [makeMessage()],
      attachmentPolicies: [policy({ policyRef: "attachment-policy-v2" })],
    });

    await expect(
      store.commit({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        newAttachments: [newAttachment()],
        attachmentCountGuards: [
          {
            messageId: MESSAGE_A,
            attachmentPolicyRef: "attachment-policy-v1",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "STALE_ATTACHMENT_POLICY",
    });
    expect(
      await store.listAttachmentsForMessage(DEPLOYMENT_A, THREAD_A, MESSAGE_A),
    ).toEqual([]);
  });

  it("rejects direct attachment publication that omits the count guard", async () => {
    const store = new InMemoryWorkflowStore({
      queues: [makeQueue()],
      threads: [makeThread()],
      messages: [makeMessage()],
      attachmentPolicies: [policy()],
    });

    await expect(
      store.commit({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        newAttachments: [newAttachment()],
      }),
    ).rejects.toThrow("requires an authoritative count guard");
    expect(
      await store.listAttachmentsForMessage(DEPLOYMENT_A, THREAD_A, MESSAGE_A),
    ).toEqual([]);
  });
});
