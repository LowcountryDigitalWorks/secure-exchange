import { describe, expect, it } from "vitest";

import { AttachmentService } from "../../src/application/attachment-service.js";
import { ApplicationError } from "../../src/application/errors.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { InMemoryProtectedContentStore } from "../../src/adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import type { Attachment } from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  QUEUE_A,
  THREAD_A,
  actorContext,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

const BYTES = new TextEncoder().encode("synthetic preview bytes");

class IdGenerator implements OpaqueIdGenerator {
  generate(purpose: OpaqueIdPurpose): string {
    return `${purpose}-synthetic`;
  }
}

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    attachmentId: "attachment-preview",
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: "message-1",
    originalDisplayFilename: "preview.pdf",
    safeDownloadFilename: "preview.pdf",
    normalizedMediaCategory: "DOCUMENT",
    normalizedMediaType: "application/pdf",
    normalizedExtension: "pdf",
    sizeBytes: BYTES.byteLength,
    contentRef: "content-preview",
    state: "CLEAN",
    createdAt: "2026-08-15T18:00:00.000Z",
    version: 2,
    lastScanResultRef: "scan-preview",
    lastScanOutcome: "CLEAN",
    lastScanAt: "2026-08-15T18:01:00.000Z",
    ...overrides,
  };
}

function fixture(options: {
  readonly seededAttachment?: Attachment;
  readonly authorization?: ReturnType<typeof makeActorAuthorization>;
} = {}) {
  const seededAttachment = options.seededAttachment ?? attachment();
  const store = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [makeThread()],
    messages: [makeMessage()],
    attachments: [seededAttachment],
    actorAuthorizations: [
      options.authorization ?? makeActorAuthorization({ permissions: ["ATTACHMENT_READ"] }),
    ],
  });
  const contentStore = new InMemoryProtectedContentStore();
  const service = new AttachmentService(
    store,
    contentStore,
    new IdGenerator(),
    "synthetic-system",
  );
  return { store, contentStore, service, seededAttachment };
}

async function expectCode(
  promise: Promise<unknown>,
  code: ApplicationError["code"],
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected application error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe(code);
  }
}

describe("authorized staff attachment candidate and preview resolution", () => {
  it("returns bounded candidate metadata without protected-content references", async () => {
    const { service } = fixture();
    const candidates = await service.listStaffAttachmentCandidates({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
    });

    expect(candidates).toEqual([
      {
        messageId: "message-1",
        attachmentId: "attachment-preview",
        safeDownloadFilename: "preview.pdf",
        normalizedMediaType: "application/pdf",
        normalizedMediaCategory: "DOCUMENT",
        byteLength: BYTES.byteLength,
        safetyState: "CLEAN",
      },
    ]);
    expect(JSON.stringify(candidates)).not.toContain("content-preview");
  });

  it("resolves exactly-CLEAN preview bytes without creating download or workflow evidence", async () => {
    const { store, contentStore, service, seededAttachment } = fixture();
    await contentStore.put(seededAttachment.contentRef, BYTES);
    const before = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    const threadBefore = await store.getThread(DEPLOYMENT_A, THREAD_A);

    const preview = await service.previewStaffAttachment({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: "message-1",
      attachmentId: seededAttachment.attachmentId,
    });

    expect([...preview.content]).toEqual([...BYTES]);
    expect(preview.normalizedMediaType).toBe("application/pdf");
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual(before);
    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(threadBefore);
    expect(await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("denies non-CLEAN preview and missing/inconsistent protected content", async () => {
    const quarantined = fixture({
      seededAttachment: attachment({ state: "QUARANTINED", version: 1 }),
    });
    await quarantined.contentStore.put("content-preview", BYTES);
    await expectCode(
      quarantined.service.previewStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: "message-1",
        attachmentId: "attachment-preview",
      }),
      "ATTACHMENT_NOT_RETRIEVABLE",
    );

    const missing = fixture();
    await expectCode(
      missing.service.previewStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: "message-1",
        attachmentId: "attachment-preview",
      }),
      "CONTENT_NOT_AVAILABLE",
    );
  });

  it("enforces STAFF actor kind, queue scope, and attachment-read permission", async () => {
    const wrongKind = fixture({
      authorization: makeActorAuthorization({
        actorKind: "ADMIN",
        permissions: ["ATTACHMENT_READ"],
      }),
    });
    await expectCode(
      wrongKind.service.listStaffAttachmentCandidates({
        actor: actorContext({ actorKind: "ADMIN" }),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
      }),
      "AUTHORIZATION_DENIED",
    );

    const wrongQueue = fixture({
      authorization: makeActorAuthorization({
        allowedQueueIds: ["other-queue"],
        permissions: ["ATTACHMENT_READ"],
      }),
    });
    await expectCode(
      wrongQueue.service.listStaffAttachmentCandidates({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
      }),
      "AUTHORIZATION_DENIED",
    );

    const noPermission = fixture({
      authorization: makeActorAuthorization({
        allowedQueueIds: [QUEUE_A],
        permissions: [],
      }),
    });
    await expectCode(
      noPermission.service.listStaffAttachmentCandidates({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("denies wrong message and thread scope without exposing attachment state", async () => {
    const { contentStore, service, seededAttachment } = fixture();
    await contentStore.put(seededAttachment.contentRef, BYTES);
    await expectCode(
      service.previewStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: "message-other",
        attachmentId: seededAttachment.attachmentId,
      }),
      "RESOURCE_NOT_FOUND",
    );
    await expectCode(
      service.previewStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: "thread-other",
        messageId: "message-1",
        attachmentId: seededAttachment.attachmentId,
      }),
      "RESOURCE_NOT_FOUND",
    );
  });
});
