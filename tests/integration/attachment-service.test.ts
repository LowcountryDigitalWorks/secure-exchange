import { describe, expect, it } from "vitest";

import { AttachmentService } from "../../src/application/attachment-service.js";
import { ApplicationError } from "../../src/application/errors.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { InMemoryProtectedContentStore } from "../../src/adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import type {
  ActorAuthorization,
  Attachment,
  AttachmentFilePolicy,
} from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  THREAD_A,
  actorContext,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

const MESSAGE_A = "message-1";
const SYSTEM_ACTOR = "synthetic-malware-scan-system";
const BYTES = new TextEncoder().encode("synthetic attachment bytes");

class SequenceIdGenerator implements OpaqueIdGenerator {
  private readonly counters = new Map<OpaqueIdPurpose, number>();

  generate(purpose: OpaqueIdPurpose): string {
    const next = (this.counters.get(purpose) ?? 0) + 1;
    this.counters.set(purpose, next);
    return `${purpose}-${next}`;
  }
}

function attachmentPolicy(
  overrides: Partial<AttachmentFilePolicy> = {},
): AttachmentFilePolicy {
  return {
    policyRef: "attachment-policy-a-v1",
    deploymentId: DEPLOYMENT_A,
    maxAttachmentSizeBytes: 1024,
    maxAttachmentsPerMessage: 3,
    allowedMediaCategories: ["DOCUMENT", "TEXT"],
    allowedMediaTypes: ["application/pdf", "text/plain"],
    allowedExtensions: ["pdf", "txt"],
    ...overrides,
  };
}

function seededAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    attachmentId: "attachment-seeded",
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    originalDisplayFilename: "seeded.pdf",
    safeDownloadFilename: "seeded.pdf",
    normalizedMediaCategory: "DOCUMENT",
    normalizedMediaType: "application/pdf",
    normalizedExtension: "pdf",
    sizeBytes: BYTES.byteLength,
    contentRef: "content-seeded",
    state: "CLEAN",
    createdAt: "2026-08-12T21:00:00.000Z",
    version: 2,
    lastScanResultRef: "scan-seeded",
    lastScanOutcome: "CLEAN",
    lastScanAt: "2026-08-12T21:01:00.000Z",
    ...overrides,
  };
}

function fixture(
  options: {
    readonly actor?: ActorAuthorization;
    readonly attachments?: readonly Attachment[];
    readonly policy?: AttachmentFilePolicy;
  } = {},
): {
  readonly store: InMemoryWorkflowStore;
  readonly content: InMemoryProtectedContentStore;
  readonly service: AttachmentService;
} {
  const store = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [makeThread()],
    messages: [makeMessage()],
    actorAuthorizations: [options.actor ?? makeActorAuthorization()],
    attachmentPolicies: [options.policy ?? attachmentPolicy()],
    attachments: options.attachments ?? [],
  });
  const content = new InMemoryProtectedContentStore();
  return {
    store,
    content,
    service: new AttachmentService(
      store,
      content,
      new SequenceIdGenerator(),
      SYSTEM_ACTOR,
    ),
  };
}

async function ingest(
  service: AttachmentService,
  overrides: Partial<Parameters<AttachmentService["ingestAttachment"]>[0]> = {},
): Promise<Attachment> {
  return service.ingestAttachment({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    originalDisplayFilename: "../../synthetic.pdf",
    declaredMediaCategory: "DOCUMENT",
    declaredMediaType: "application/pdf",
    content: BYTES,
    at: "2026-08-12T21:00:00.000Z",
    ...overrides,
  });
}

async function clean(
  service: AttachmentService,
  attachment: Attachment,
  scanResultRef = "scan-clean",
): Promise<Attachment> {
  return service.recordScanResult({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    attachmentId: attachment.attachmentId,
    scanResultRef,
    outcome: "CLEAN",
    at: "2026-08-12T21:01:00.000Z",
  });
}

async function expectApplicationCode(
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

describe("attachment service", () => {
  it("stages synthetic content and publishes only QUARANTINED metadata", async () => {
    const { store, content, service } = fixture();
    const created = await ingest(service);

    expect(created).toMatchObject({
      state: "QUARANTINED",
      safeDownloadFilename: "synthetic.pdf",
      normalizedMediaType: "application/pdf",
      version: 1,
    });
    expect(created.contentRef).not.toContain(created.originalDisplayFilename);
    expect(content.has(created.contentRef)).toBe(true);
    expect(
      await store.getAttachment(DEPLOYMENT_A, created.attachmentId),
    ).toEqual(created);
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .map((item) => item.eventType),
    ).toEqual(["ATTACHMENT_REGISTERED", "ATTACHMENT_QUARANTINED"]);
  });

  it("rejects attachment-count overflow before staging content", async () => {
    const existing = [
      seededAttachment({ attachmentId: "attachment-1" }),
      seededAttachment({ attachmentId: "attachment-2" }),
      seededAttachment({ attachmentId: "attachment-3" }),
    ];
    const { content, service } = fixture({ attachments: existing });
    await expectApplicationCode(ingest(service), "ATTACHMENT_POLICY_REJECTED");
    expect(content.count).toBe(0);
  });

  it("does not publish metadata when protected-content write fails", async () => {
    const { store, content, service } = fixture();
    content.failNextPut();
    await expectApplicationCode(ingest(service), "CONTENT_STORAGE_FAILED");
    expect(content.count).toBe(0);
    expect(
      await store.listAttachmentsForMessage(DEPLOYMENT_A, THREAD_A, MESSAGE_A),
    ).toEqual([]);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("compensates staged content when metadata transaction fails", async () => {
    const { store, content, service } = fixture();
    store.failNextCommit();
    await expectApplicationCode(
      ingest(service),
      "ATTACHMENT_PUBLICATION_FAILED",
    );
    expect(content.count).toBe(0);
    expect(
      await store.listAttachmentsForMessage(DEPLOYMENT_A, THREAD_A, MESSAGE_A),
    ).toEqual([]);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("keeps newly ingested/quarantined content non-retrievable", async () => {
    const { store, service } = fixture();
    const created = await ingest(service);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: created.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "ATTACHMENT_NOT_RETRIEVABLE",
    );
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .some((item) => item.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
  });

  it("accepts a clean scan and authoritatively retrieves bytes with exactly one download event", async () => {
    const { store, service } = fixture();
    const created = await ingest(service);
    const cleanAttachment = await clean(service, created);
    const beforeThread = await store.getThread(DEPLOYMENT_A, THREAD_A);

    const result = await service.retrieveStaffAttachment({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: MESSAGE_A,
      attachmentId: cleanAttachment.attachmentId,
      at: "2026-08-12T21:02:00.000Z",
    });

    expect([...result.content]).toEqual([...BYTES]);
    expect(result.safeDownloadFilename).toBe("synthetic.pdf");
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .filter((item) => item.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toHaveLength(1);
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(beforeThread);
  });

  it("maps malicious scan results to REJECTED and blocks retrieval", async () => {
    const { store, service } = fixture();
    const created = await ingest(service);
    const rejected = await service.recordScanResult({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: MESSAGE_A,
      attachmentId: created.attachmentId,
      scanResultRef: "scan-malicious",
      outcome: "MALICIOUS",
      at: "2026-08-12T21:01:00.000Z",
    });
    expect(rejected.state).toBe("REJECTED");
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: rejected.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "ATTACHMENT_NOT_RETRIEVABLE",
    );
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .some((item) => item.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
  });

  it("keeps indeterminate scanner results quarantined", async () => {
    const { service } = fixture();
    const created = await ingest(service);
    const scanned = await service.recordScanResult({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: MESSAGE_A,
      attachmentId: created.attachmentId,
      scanResultRef: "scan-indeterminate",
      outcome: "INDETERMINATE",
      at: "2026-08-12T21:01:00.000Z",
    });
    expect(scanned).toMatchObject({ state: "QUARANTINED", version: 2 });
  });

  it("treats exact scan-event replay as idempotent without duplicate audit", async () => {
    const { store, service } = fixture();
    const created = await ingest(service);
    const first = await clean(service, created, "scan-repeat");
    const auditCount = store.listAuditEvents(DEPLOYMENT_A, THREAD_A).length;
    const replay = await service.recordScanResult({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: MESSAGE_A,
      attachmentId: created.attachmentId,
      scanResultRef: "scan-repeat",
      outcome: "CLEAN",
      at: "2026-08-12T21:02:00.000Z",
    });
    expect(replay).toEqual(first);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toHaveLength(
      auditCount,
    );
  });

  it("rolls scan-state mutation and audit back together", async () => {
    const { store, service } = fixture();
    const created = await ingest(service);
    const auditCount = store.listAuditEvents(DEPLOYMENT_A, THREAD_A).length;
    store.failNextCommit();
    await expect(clean(service, created, "scan-rollback")).rejects.toThrow(
      "Synthetic transaction failure",
    );
    expect(
      await store.getAttachment(DEPLOYMENT_A, created.attachmentId),
    ).toMatchObject({ state: "QUARANTINED", version: 1 });
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toHaveLength(
      auditCount,
    );
  });

  it("rejects cross-deployment scan updates", async () => {
    const { service } = fixture();
    const created = await ingest(service);
    await expectApplicationCode(
      service.recordScanResult({
        deploymentId: DEPLOYMENT_B,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: created.attachmentId,
        scanResultRef: "scan-wrong-deployment",
        outcome: "CLEAN",
        at: "2026-08-12T21:01:00.000Z",
      }),
      "RESOURCE_NOT_FOUND",
    );
  });

  it("denies cross-deployment staff retrieval", async () => {
    const { service } = fixture();
    const created = await ingest(service);
    await clean(service, created);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext({ deploymentId: DEPLOYMENT_B }),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: created.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("denies wrong-thread attachment retrieval", async () => {
    const wrongThread = seededAttachment({ threadId: "thread-other" });
    const { content, service } = fixture({ attachments: [wrongThread] });
    await content.put(wrongThread.contentRef, BYTES);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: wrongThread.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "ATTACHMENT_NOT_FOUND",
    );
  });

  it("denies wrong-message attachment retrieval", async () => {
    const wrongMessage = seededAttachment({ messageId: "message-other" });
    const { content, service } = fixture({ attachments: [wrongMessage] });
    await content.put(wrongMessage.contentRef, BYTES);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: wrongMessage.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "ATTACHMENT_NOT_FOUND",
    );
  });

  it("denies retrieval when current queue scope is absent", async () => {
    const actor = makeActorAuthorization({ allowedQueueIds: ["other-queue"] });
    const { content, service } = fixture({
      actor,
      attachments: [seededAttachment()],
    });
    await content.put("content-seeded", BYTES);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: "attachment-seeded",
        at: "2026-08-12T21:02:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("denies retrieval when ATTACHMENT_READ permission is absent", async () => {
    const actor = makeActorAuthorization({ permissions: ["THREAD_OPEN"] });
    const { content, service } = fixture({
      actor,
      attachments: [seededAttachment()],
    });
    await content.put("content-seeded", BYTES);
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: "attachment-seeded",
        at: "2026-08-12T21:02:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("does not emit download evidence when protected content is missing", async () => {
    const item = seededAttachment();
    const { store, service } = fixture({ attachments: [item] });
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: item.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "CONTENT_NOT_AVAILABLE",
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("does not emit download evidence when content retrieval fails", async () => {
    const item = seededAttachment();
    const { store, content, service } = fixture({ attachments: [item] });
    await content.put(item.contentRef, BYTES);
    content.failNextGet();
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: item.attachmentId,
        at: "2026-08-12T21:02:00.000Z",
      }),
      "CONTENT_NOT_AVAILABLE",
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("blocks DELETED attachments before touching protected content", async () => {
    const item = seededAttachment({
      state: "DELETED",
      deletedAt: "2026-08-12T21:02:00.000Z",
    });
    const { store, content, service } = fixture({ attachments: [item] });
    await content.put(item.contentRef, BYTES);
    content.failNextGet();
    await expectApplicationCode(
      service.retrieveStaffAttachment({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        messageId: MESSAGE_A,
        attachmentId: item.attachmentId,
        at: "2026-08-12T21:03:00.000Z",
      }),
      "ATTACHMENT_NOT_RETRIEVABLE",
    );
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("keeps audit evidence free of content and unrestricted filenames", async () => {
    const { store, service } = fixture();
    const created = await ingest(service, {
      originalDisplayFilename: "../../secret-name.pdf",
    });
    await clean(service, created);
    await service.retrieveStaffAttachment({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      messageId: MESSAGE_A,
      attachmentId: created.attachmentId,
      at: "2026-08-12T21:02:00.000Z",
    });
    const serialized = JSON.stringify(
      store.listAuditEvents(DEPLOYMENT_A, THREAD_A),
    );
    expect(serialized).not.toContain("secret-name.pdf");
    expect(serialized).not.toContain("synthetic attachment bytes");
  });
});
