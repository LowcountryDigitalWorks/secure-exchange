import { describe, expect, it } from "vitest";

import { AccessGrantService } from "../../src/application/access-grant-service.js";
import type { Clock } from "../../src/application/clock.js";
import { ApplicationError } from "../../src/application/errors.js";
import { ExternalAttachmentRetrievalService } from "../../src/application/external-attachment-retrieval-service.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { InMemoryProtectedContentStore } from "../../src/adapters/in-memory-protected-content-store.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";
import type {
  AccessGrantOperation,
  Attachment,
  AttachmentSafetyState,
} from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  EXTERNAL_A,
  STAFF_A,
  THREAD_A,
  actorContext,
  makeAccessGrantPolicy,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

const MESSAGE_A = "message-1";
const MESSAGE_B = "message-2";
const ATTACHMENT_A = "attachment-a";
const CONTENT_A = "content-a";
const BYTES = new TextEncoder().encode("synthetic external attachment bytes");

class SequenceIdGenerator implements OpaqueIdGenerator {
  private readonly counters = new Map<OpaqueIdPurpose, number>();

  generate(purpose: OpaqueIdPurpose): string {
    const next = (this.counters.get(purpose) ?? 0) + 1;
    this.counters.set(purpose, next);
    return `${purpose}-${next}`;
  }
}

class MutableClock implements Clock {
  constructor(private value: string) {}

  now(): string {
    return this.value;
  }

  set(value: string): void {
    this.value = value;
  }
}

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    attachmentId: ATTACHMENT_A,
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    originalDisplayFilename: "../../untrusted original.pdf",
    safeDownloadFilename: "untrusted original.pdf",
    normalizedMediaCategory: "DOCUMENT",
    normalizedMediaType: "application/pdf",
    normalizedExtension: "pdf",
    sizeBytes: BYTES.byteLength,
    contentRef: CONTENT_A,
    state: "CLEAN",
    createdAt: "2026-08-13T02:20:00.000Z",
    version: 2,
    lastScanResultRef: "scan-clean-a",
    lastScanOutcome: "CLEAN",
    lastScanAt: "2026-08-13T02:21:00.000Z",
    ...overrides,
  };
}

async function fixture(
  options: {
    readonly allowedOperations?: readonly AccessGrantOperation[];
    readonly attachment?: Attachment;
    readonly threadState?: ReturnType<typeof makeThread>["state"];
    readonly seedContent?: boolean;
    readonly contentBytes?: Uint8Array;
    readonly additionalThreads?: readonly ReturnType<typeof makeThread>[];
    readonly additionalMessages?: readonly ReturnType<typeof makeMessage>[];
    readonly additionalAttachments?: readonly Attachment[];
  } = {},
): Promise<{
  readonly store: InMemoryWorkflowStore;
  readonly content: InMemoryProtectedContentStore;
  readonly grantService: AccessGrantService;
  readonly externalService: ExternalAttachmentRetrievalService;
  readonly clock: MutableClock;
  readonly seededAttachment: Attachment;
}> {
  const clock = new MutableClock("2026-08-13T02:30:00.000Z");
  const ids = new SequenceIdGenerator();
  const seededAttachment = options.attachment ?? attachment();
  const messages = [
    makeMessage({ messageId: MESSAGE_A, actorRef: EXTERNAL_A }),
    makeMessage({
      messageId: MESSAGE_B,
      direction: "STAFF_TO_EXTERNAL",
      actorRef: STAFF_A,
      createdAt: "2026-08-13T02:22:00.000Z",
    }),
    ...(options.additionalMessages ?? []),
  ];
  const store = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [
      makeThread({ state: options.threadState ?? "IN_PROGRESS" }),
      ...(options.additionalThreads ?? []),
    ],
    messages,
    attachments: [seededAttachment, ...(options.additionalAttachments ?? [])],
    accessGrantPolicies: [
      makeAccessGrantPolicy({
        allowedOperations: options.allowedOperations ?? [
          "THREAD_READ",
          "ATTACHMENT_READ",
        ],
      }),
    ],
    actorAuthorizations: [makeActorAuthorization()],
  });
  const content = new InMemoryProtectedContentStore();
  if (options.seedContent !== false) {
    await content.put(CONTENT_A, options.contentBytes ?? BYTES);
  }
  const grantService = new AccessGrantService(
    store,
    ids,
    new WebCryptoAccessGrantSecretManager(),
    clock,
  );
  return {
    store,
    content,
    grantService,
    externalService: new ExternalAttachmentRetrievalService(
      store,
      content,
      ids,
      grantService,
      clock,
    ),
    clock,
    seededAttachment,
  };
}

async function issue(
  service: AccessGrantService,
  operations: readonly AccessGrantOperation[] = ["ATTACHMENT_READ"],
) {
  return service.issueAccessGrant({
    actor: actorContext(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    requestedOperations: operations,
    requestedLifetimeSeconds: 600,
  });
}

function retrievalInput(
  issued: Awaited<ReturnType<typeof issue>>,
  overrides: Partial<
    Parameters<
      ExternalAttachmentRetrievalService["retrieveExternalAttachment"]
    >[0]
  > = {},
) {
  return {
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    messageId: MESSAGE_A,
    attachmentId: ATTACHMENT_A,
    grantId: issued.grantId,
    secret: issued.secret,
    ...overrides,
  };
}

async function expectExternalDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error("Expected external access denial.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as ApplicationError).code).toBe("EXTERNAL_ACCESS_DENIED");
  }
}

function downloadEvents(store: InMemoryWorkflowStore) {
  return store
    .listAuditEvents(DEPLOYMENT_A, THREAD_A)
    .filter((event) => event.eventType === "ATTACHMENT_DOWNLOADED");
}

describe("external attachment retrieval", () => {
  it("issues explicit ATTACHMENT_READ authority and returns only safe delivery metadata plus bytes", async () => {
    const { store, grantService, externalService } = await fixture();
    const issued = await issue(grantService);
    const stored = await store.getAccessGrant(DEPLOYMENT_A, issued.grantId);
    const result = await externalService.retrieveExternalAttachment(
      retrievalInput(issued),
    );

    expect(issued.permittedOperations).toEqual(["ATTACHMENT_READ"]);
    expect(stored?.permittedOperations).toEqual(["ATTACHMENT_READ"]);
    expect(result.safeDownloadFilename).toBe("untrusted original.pdf");
    expect(result.normalizedMediaType).toBe("application/pdf");
    expect(result.byteLength).toBe(BYTES.byteLength);
    expect([...result.content]).toEqual([...BYTES]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(CONTENT_A);
    expect(serialized).not.toContain("protectedContentRef");
    expect(serialized).not.toContain("verifier");
  });

  it("keeps THREAD_READ and ATTACHMENT_READ independent", async () => {
    const threadOnly = await fixture();
    const threadGrant = await issue(threadOnly.grantService, ["THREAD_READ"]);
    await expect(
      threadOnly.grantService.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: threadGrant.grantId,
        secret: threadGrant.secret,
      }),
    ).resolves.toBeDefined();
    await expectExternalDenied(
      threadOnly.externalService.retrieveExternalAttachment(
        retrievalInput(threadGrant),
      ),
    );

    const attachmentOnly = await fixture();
    const attachmentGrant = await issue(attachmentOnly.grantService, [
      "ATTACHMENT_READ",
    ]);
    await expect(
      attachmentOnly.externalService.retrieveExternalAttachment(
        retrievalInput(attachmentGrant),
      ),
    ).resolves.toBeDefined();
    await expectExternalDenied(
      attachmentOnly.grantService.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: attachmentGrant.grantId,
        secret: attachmentGrant.secret,
      }),
    );
  });

  it("allows a mixed-operation grant to exercise each authority independently", async () => {
    const { grantService, externalService } = await fixture();
    const issued = await issue(grantService, [
      "THREAD_READ",
      "ATTACHMENT_READ",
    ]);

    await expect(
      grantService.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
    ).resolves.toBeDefined();
    await expect(
      externalService.retrieveExternalAttachment(retrievalInput(issued)),
    ).resolves.toBeDefined();
  });

  it("rejects ATTACHMENT_READ issuance when the current policy does not permit it", async () => {
    const { grantService } = await fixture({
      allowedOperations: ["THREAD_READ"],
    });
    await expect(
      issue(grantService, ["ATTACHMENT_READ"]),
    ).rejects.toMatchObject({ code: "ACCESS_GRANT_POLICY_REJECTED" });
  });

  it("denies wrong secret, revoked grant, and expired grant", async () => {
    const wrongSecretFixture = await fixture();
    const wrongSecretGrant = await issue(wrongSecretFixture.grantService);
    await expectExternalDenied(
      wrongSecretFixture.externalService.retrieveExternalAttachment(
        retrievalInput(wrongSecretGrant, { secret: "not-the-issued-secret" }),
      ),
    );

    const revokedFixture = await fixture();
    const revokedGrant = await issue(revokedFixture.grantService);
    await revokedFixture.grantService.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: revokedGrant.grantId,
      expectedVersion: 1,
    });
    await expectExternalDenied(
      revokedFixture.externalService.retrieveExternalAttachment(
        retrievalInput(revokedGrant),
      ),
    );

    const expiredFixture = await fixture();
    const expiredGrant = await issue(expiredFixture.grantService);
    expiredFixture.clock.set("2026-08-13T02:40:00.000Z");
    await expectExternalDenied(
      expiredFixture.externalService.retrieveExternalAttachment(
        retrievalInput(expiredGrant),
      ),
    );
  });

  it("denies wrong deployment, wrong grant thread, and attachment ownership outside the grant thread", async () => {
    const { grantService, externalService } = await fixture();
    const issued = await issue(grantService);

    await expectExternalDenied(
      externalService.retrieveExternalAttachment(
        retrievalInput(issued, { deploymentId: DEPLOYMENT_B }),
      ),
    );
    await expectExternalDenied(
      externalService.retrieveExternalAttachment(
        retrievalInput(issued, { threadId: "thread-other" }),
      ),
    );

    const crossThreadAttachment = attachment({
      attachmentId: "attachment-other-thread",
      threadId: "thread-other",
      contentRef: "content-other-thread",
    });
    const scoped = await fixture({
      additionalThreads: [makeThread({ threadId: "thread-other" })],
      additionalMessages: [
        makeMessage({ messageId: "message-other", threadId: "thread-other" }),
      ],
      additionalAttachments: [crossThreadAttachment],
    });
    await scoped.content.put("content-other-thread", BYTES);
    const scopedGrant = await issue(scoped.grantService);
    await expectExternalDenied(
      scoped.externalService.retrieveExternalAttachment(
        retrievalInput(scopedGrant, {
          attachmentId: crossThreadAttachment.attachmentId,
        }),
      ),
    );
  });

  it("denies nonexistent attachments and wrong-message associations", async () => {
    const { grantService, externalService } = await fixture();
    const issued = await issue(grantService);
    await expectExternalDenied(
      externalService.retrieveExternalAttachment(
        retrievalInput(issued, { attachmentId: "attachment-missing" }),
      ),
    );

    const wrongMessageAttachment = attachment({ messageId: MESSAGE_B });
    const wrongMessage = await fixture({ attachment: wrongMessageAttachment });
    const wrongMessageGrant = await issue(wrongMessage.grantService);
    await expectExternalDenied(
      wrongMessage.externalService.retrieveExternalAttachment(
        retrievalInput(wrongMessageGrant),
      ),
    );
  });

  it("permits exactly CLEAN and denies every other attachment safety state", async () => {
    for (const state of [
      "PENDING_UPLOAD",
      "QUARANTINED",
      "REJECTED",
      "DELETED",
    ] satisfies readonly AttachmentSafetyState[]) {
      const item = attachment({
        state,
        ...(state === "DELETED"
          ? { deletedAt: "2026-08-13T02:25:00.000Z" }
          : {}),
      });
      const current = await fixture({ attachment: item });
      const issued = await issue(current.grantService);
      await expectExternalDenied(
        current.externalService.retrieveExternalAttachment(
          retrievalInput(issued),
        ),
      );
      expect(downloadEvents(current.store)).toHaveLength(0);
    }

    const clean = await fixture();
    const cleanGrant = await issue(clean.grantService);
    await expect(
      clean.externalService.retrieveExternalAttachment(
        retrievalInput(cleanGrant),
      ),
    ).resolves.toBeDefined();
    expect(downloadEvents(clean.store)).toHaveLength(1);
  });

  it("denies missing content, protected-content read failure, and byte-length mismatch without download evidence", async () => {
    const missing = await fixture({ seedContent: false });
    const missingGrant = await issue(missing.grantService);
    await expectExternalDenied(
      missing.externalService.retrieveExternalAttachment(
        retrievalInput(missingGrant),
      ),
    );
    expect(downloadEvents(missing.store)).toHaveLength(0);

    const failedRead = await fixture();
    const failedReadGrant = await issue(failedRead.grantService);
    failedRead.content.failNextGet();
    await expectExternalDenied(
      failedRead.externalService.retrieveExternalAttachment(
        retrievalInput(failedReadGrant),
      ),
    );
    expect(downloadEvents(failedRead.store)).toHaveLength(0);

    const mismatched = await fixture({
      contentBytes: new TextEncoder().encode("wrong length"),
    });
    const mismatchedGrant = await issue(mismatched.grantService);
    await expectExternalDenied(
      mismatched.externalService.retrieveExternalAttachment(
        retrievalInput(mismatchedGrant),
      ),
    );
    expect(downloadEvents(mismatched.store)).toHaveLength(0);
  });

  it("revalidates current thread eligibility and never lets a grant override EXPIRED or DISPOSED", async () => {
    for (const state of ["EXPIRED", "DISPOSED"] as const) {
      const current = await fixture({ threadState: state });
      await expect(issue(current.grantService)).rejects.toMatchObject({
        code: "ACCESS_GRANT_POLICY_REJECTED",
      });
    }
  });

  it("emits minimized external ATTACHMENT_DOWNLOADED evidence only after successful integrity validation", async () => {
    const { store, grantService, externalService } = await fixture();
    const issued = await issue(grantService);
    const storedGrant = await store.getAccessGrant(
      DEPLOYMENT_A,
      issued.grantId,
    );

    await externalService.retrieveExternalAttachment(retrievalInput(issued));

    const events = downloadEvents(store);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      eventType: "ATTACHMENT_DOWNLOADED",
      actorRef: EXTERNAL_A,
      actorKind: "EXTERNAL",
      attachmentId: ATTACHMENT_A,
      accessGrantId: issued.grantId,
      outcome: "SUCCEEDED",
    });
    const serializedAudit = JSON.stringify(
      store.listAuditEvents(DEPLOYMENT_A, THREAD_A),
    );
    expect(serializedAudit).not.toContain(issued.secret);
    expect(serializedAudit).not.toContain(
      storedGrant?.verifierDigest ?? "never",
    );
    expect(serializedAudit).not.toContain(CONTENT_A);
    expect(serializedAudit).not.toContain(
      "synthetic external attachment bytes",
    );
  });

  it("keeps external download distinct from TransferAttestation and thread completion", async () => {
    const { store, grantService, externalService } = await fixture();
    const issued = await issue(grantService);
    const before = await store.getThread(DEPLOYMENT_A, THREAD_A);

    await externalService.retrieveExternalAttachment(retrievalInput(issued));

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(before);
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .some((event) => event.eventType === "THREAD_COMPLETED"),
    ).toBe(false);
  });
});
