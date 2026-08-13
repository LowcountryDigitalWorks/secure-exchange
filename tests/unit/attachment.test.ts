import { describe, expect, it } from "vitest";

import {
  applyAttachmentScanResult,
  normalizeDeclaredAttachmentMetadata,
  requireAttachmentRetrievable,
  validateAttachmentFilePolicy,
  type Attachment,
  type AttachmentFilePolicy,
} from "../../src/domain/attachment.js";
import { DomainError } from "../../src/domain/errors.js";

const POLICY: AttachmentFilePolicy = {
  policyRef: "attachment-policy-a-v1",
  deploymentId: "deployment-a",
  maxAttachmentSizeBytes: 1024,
  maxAttachmentsPerMessage: 3,
  allowedMediaCategories: ["DOCUMENT", "TEXT"],
  allowedMediaTypes: ["application/pdf", "text/plain"],
  allowedExtensions: ["pdf", "txt"],
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    attachmentId: "attachment-a",
    deploymentId: "deployment-a",
    threadId: "thread-a",
    messageId: "message-a",
    originalDisplayFilename: "document.pdf",
    safeDownloadFilename: "document.pdf",
    normalizedMediaCategory: "DOCUMENT",
    normalizedMediaType: "application/pdf",
    normalizedExtension: "pdf",
    sizeBytes: 4,
    contentRef: "content-ref-a",
    state: "QUARANTINED",
    createdAt: "2026-08-12T21:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function expectDomainCode(
  action: () => unknown,
  code: DomainError["code"],
): void {
  try {
    action();
    throw new Error("Expected domain error.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}

describe("attachment policy and safety model", () => {
  it("normalizes bounded declared metadata", () => {
    expect(
      normalizeDeclaredAttachmentMetadata(
        {
          originalDisplayFilename: "Record.PDF",
          declaredMediaCategory: "DOCUMENT",
          declaredMediaType: " Application/PDF ",
          sizeBytes: 42,
        },
        POLICY,
      ),
    ).toEqual({
      originalDisplayFilename: "Record.PDF",
      safeDownloadFilename: "Record.PDF",
      normalizedMediaCategory: "DOCUMENT",
      normalizedMediaType: "application/pdf",
      normalizedExtension: "pdf",
      sizeBytes: 42,
    });
  });

  it("rejects oversized attachment metadata", () => {
    expectDomainCode(
      () =>
        normalizeDeclaredAttachmentMetadata(
          {
            originalDisplayFilename: "large.pdf",
            declaredMediaCategory: "DOCUMENT",
            declaredMediaType: "application/pdf",
            sizeBytes: 1025,
          },
          POLICY,
        ),
      "INVALID_ATTACHMENT_METADATA",
    );
  });

  it("rejects unsupported declared media type", () => {
    expectDomainCode(
      () =>
        normalizeDeclaredAttachmentMetadata(
          {
            originalDisplayFilename: "image.pdf",
            declaredMediaCategory: "DOCUMENT",
            declaredMediaType: "image/png",
            sizeBytes: 10,
          },
          POLICY,
        ),
      "INVALID_ATTACHMENT_METADATA",
    );
  });

  it("rejects unsupported filename extension", () => {
    expectDomainCode(
      () =>
        normalizeDeclaredAttachmentMetadata(
          {
            originalDisplayFilename: "archive.zip",
            declaredMediaCategory: "DOCUMENT",
            declaredMediaType: "application/pdf",
            sizeBytes: 10,
          },
          POLICY,
        ),
      "INVALID_ATTACHMENT_METADATA",
    );
  });

  it("derives a path-safe filename while retaining original display metadata", () => {
    const normalized = normalizeDeclaredAttachmentMetadata(
      {
        originalDisplayFilename: "../../folder/report.pdf",
        declaredMediaCategory: "DOCUMENT",
        declaredMediaType: "application/pdf",
        sizeBytes: 10,
      },
      POLICY,
    );
    expect(normalized.originalDisplayFilename).toBe("../../folder/report.pdf");
    expect(normalized.safeDownloadFilename).toBe("report.pdf");
  });

  it("rejects control-shaped filenames", () => {
    expectDomainCode(
      () =>
        normalizeDeclaredAttachmentMetadata(
          {
            originalDisplayFilename: "report\r\nInjected.pdf",
            declaredMediaCategory: "DOCUMENT",
            declaredMediaType: "application/pdf",
            sizeBytes: 10,
          },
          POLICY,
        ),
      "INVALID_ATTACHMENT_METADATA",
    );
  });

  it("rejects invalid attachment policy configuration", () => {
    expectDomainCode(
      () =>
        validateAttachmentFilePolicy({
          ...POLICY,
          allowedExtensions: ["pdf", "pdf"],
        }),
      "INVALID_ATTACHMENT_POLICY",
    );
  });

  it("moves quarantined attachments to CLEAN only on clean scan", () => {
    expect(
      applyAttachmentScanResult(
        attachment(),
        "scan-clean",
        "CLEAN",
        "2026-08-12T21:01:00.000Z",
      ),
    ).toMatchObject({ state: "CLEAN", version: 2 });
  });

  it("moves malicious scan results to REJECTED", () => {
    expect(
      applyAttachmentScanResult(
        attachment(),
        "scan-malicious",
        "MALICIOUS",
        "2026-08-12T21:01:00.000Z",
      ),
    ).toMatchObject({ state: "REJECTED", version: 2 });
  });

  it("keeps indeterminate scan results quarantined", () => {
    expect(
      applyAttachmentScanResult(
        attachment(),
        "scan-unknown",
        "INDETERMINATE",
        "2026-08-12T21:01:00.000Z",
      ),
    ).toMatchObject({ state: "QUARANTINED", version: 2 });
  });

  it("treats an exact scan-result replay as idempotent", () => {
    const once = applyAttachmentScanResult(
      attachment(),
      "scan-clean",
      "CLEAN",
      "2026-08-12T21:01:00.000Z",
    );
    expect(
      applyAttachmentScanResult(
        once,
        "scan-clean",
        "CLEAN",
        "2026-08-12T21:02:00.000Z",
      ),
    ).toBe(once);
  });

  it("rejects a new scan transition from an already clean attachment", () => {
    const clean = applyAttachmentScanResult(
      attachment(),
      "scan-clean",
      "CLEAN",
      "2026-08-12T21:01:00.000Z",
    );
    expectDomainCode(
      () =>
        applyAttachmentScanResult(
          clean,
          "scan-late",
          "MALICIOUS",
          "2026-08-12T21:02:00.000Z",
        ),
      "INVALID_ATTACHMENT_STATE",
    );
  });

  it("permits normal retrieval only for CLEAN state", () => {
    expect(() =>
      requireAttachmentRetrievable(attachment({ state: "CLEAN" })),
    ).not.toThrow();
    for (const state of [
      "PENDING_UPLOAD",
      "QUARANTINED",
      "REJECTED",
      "DELETED",
    ] as const) {
      expectDomainCode(
        () => requireAttachmentRetrievable(attachment({ state })),
        "INVALID_ATTACHMENT_STATE",
      );
    }
  });
});
