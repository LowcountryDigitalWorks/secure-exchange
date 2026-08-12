import { DomainError } from "./errors.js";
import type {
  AttachmentId,
  AttachmentPolicyRef,
  DeploymentId,
  MessageId,
  ProtectedContentRef,
  ThreadId,
} from "./types.js";

export type AttachmentSafetyState =
  "PENDING_UPLOAD" | "QUARANTINED" | "CLEAN" | "REJECTED" | "DELETED";

export type AttachmentMediaCategory = "DOCUMENT" | "IMAGE" | "TEXT" | "ARCHIVE";

export type AttachmentScanOutcome = "CLEAN" | "MALICIOUS" | "INDETERMINATE";

export interface AttachmentFilePolicy {
  readonly policyRef: AttachmentPolicyRef;
  readonly deploymentId: DeploymentId;
  readonly maxAttachmentSizeBytes: number;
  readonly maxAttachmentsPerMessage: number;
  readonly allowedMediaCategories: readonly AttachmentMediaCategory[];
  readonly allowedMediaTypes: readonly string[];
  readonly allowedExtensions: readonly string[];
}

export interface Attachment {
  readonly attachmentId: AttachmentId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly originalDisplayFilename: string;
  readonly safeDownloadFilename: string;
  readonly normalizedMediaCategory: AttachmentMediaCategory;
  readonly normalizedMediaType: string;
  readonly normalizedExtension: string;
  readonly sizeBytes: number;
  readonly contentRef: ProtectedContentRef;
  readonly state: AttachmentSafetyState;
  readonly createdAt: string;
  readonly version: number;
  readonly lastScanResultRef?: string;
  readonly lastScanOutcome?: AttachmentScanOutcome;
  readonly lastScanAt?: string;
  readonly deletedAt?: string;
}

export interface DeclaredAttachmentMetadataInput {
  readonly originalDisplayFilename: string;
  readonly declaredMediaCategory: AttachmentMediaCategory;
  readonly declaredMediaType: string;
  readonly sizeBytes: number;
}

export interface NormalizedAttachmentFileMetadata {
  readonly originalDisplayFilename: string;
  readonly safeDownloadFilename: string;
  readonly normalizedMediaCategory: AttachmentMediaCategory;
  readonly normalizedMediaType: string;
  readonly normalizedExtension: string;
  readonly sizeBytes: number;
}

const MAX_POLICY_LIST_ITEMS = 32;
const MAX_ORIGINAL_FILENAME_LENGTH = 255;
const MAX_SAFE_FILENAME_LENGTH = 120;
const MAX_MEDIA_TYPE_LENGTH = 128;
const MAX_SCAN_RESULT_REF_LENGTH = 128;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const EXTENSION_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,15}$/u;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function assertUniqueBoundedList(
  values: readonly string[],
  label: string,
): void {
  if (
    values.length === 0 ||
    values.length > MAX_POLICY_LIST_ITEMS ||
    new Set(values).size !== values.length
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_POLICY",
      `${label} must be a non-empty bounded unique list.`,
    );
  }
}

export function validateAttachmentFilePolicy(
  policy: AttachmentFilePolicy,
): AttachmentFilePolicy {
  if (
    policy.policyRef.length === 0 ||
    policy.deploymentId.length === 0 ||
    !Number.isSafeInteger(policy.maxAttachmentSizeBytes) ||
    policy.maxAttachmentSizeBytes <= 0 ||
    !Number.isSafeInteger(policy.maxAttachmentsPerMessage) ||
    policy.maxAttachmentsPerMessage <= 0 ||
    policy.maxAttachmentsPerMessage > 20
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_POLICY",
      "Attachment policy limits or identifiers are invalid.",
    );
  }

  assertUniqueBoundedList(policy.allowedMediaCategories, "Media categories");
  assertUniqueBoundedList(policy.allowedMediaTypes, "Media types");
  assertUniqueBoundedList(policy.allowedExtensions, "Extensions");

  for (const mediaType of policy.allowedMediaTypes) {
    if (
      mediaType !== mediaType.toLowerCase() ||
      mediaType.length > MAX_MEDIA_TYPE_LENGTH ||
      !MEDIA_TYPE_PATTERN.test(mediaType)
    ) {
      throw new DomainError(
        "INVALID_ATTACHMENT_POLICY",
        "Attachment policy contains an invalid normalized media type.",
      );
    }
  }

  for (const extension of policy.allowedExtensions) {
    if (
      extension !== extension.toLowerCase() ||
      !EXTENSION_PATTERN.test(extension)
    ) {
      throw new DomainError(
        "INVALID_ATTACHMENT_POLICY",
        "Attachment policy contains an invalid normalized extension.",
      );
    }
  }

  return policy;
}

function safeFilename(original: string): string {
  const basename = original.split(/[\\/]/u).at(-1) ?? "";
  let candidate = basename
    .replace(/[^A-Za-z0-9._ -]/gu, "_")
    .replace(/^[. ]+/u, "")
    .replace(/[. ]+$/u, "")
    .replace(/\s+/gu, " ");

  if (candidate.length === 0) {
    candidate = "attachment";
  }

  return candidate.slice(0, MAX_SAFE_FILENAME_LENGTH);
}

function extensionFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return "";
  }
  return filename.slice(dot + 1).toLowerCase();
}

export function normalizeDeclaredAttachmentMetadata(
  input: DeclaredAttachmentMetadataInput,
  policy: AttachmentFilePolicy,
): NormalizedAttachmentFileMetadata {
  validateAttachmentFilePolicy(policy);

  if (
    input.originalDisplayFilename.length === 0 ||
    input.originalDisplayFilename.length > MAX_ORIGINAL_FILENAME_LENGTH ||
    hasControlCharacters(input.originalDisplayFilename)
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Attachment display filename is invalid.",
    );
  }

  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > policy.maxAttachmentSizeBytes
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Attachment size is outside the configured policy.",
    );
  }

  if (!policy.allowedMediaCategories.includes(input.declaredMediaCategory)) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Declared attachment media category is not permitted.",
    );
  }

  const normalizedMediaType = input.declaredMediaType.trim().toLowerCase();
  if (
    normalizedMediaType.length === 0 ||
    normalizedMediaType.length > MAX_MEDIA_TYPE_LENGTH ||
    !MEDIA_TYPE_PATTERN.test(normalizedMediaType) ||
    !policy.allowedMediaTypes.includes(normalizedMediaType)
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Declared attachment media type is not permitted.",
    );
  }

  const safeDownloadFilename = safeFilename(input.originalDisplayFilename);
  const normalizedExtension = extensionFromFilename(safeDownloadFilename);
  if (
    normalizedExtension.length === 0 ||
    !policy.allowedExtensions.includes(normalizedExtension)
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Declared attachment filename extension is not permitted.",
    );
  }

  return {
    originalDisplayFilename: input.originalDisplayFilename,
    safeDownloadFilename,
    normalizedMediaCategory: input.declaredMediaCategory,
    normalizedMediaType,
    normalizedExtension,
    sizeBytes: input.sizeBytes,
  };
}

export function validateAttachment(attachment: Attachment): Attachment {
  const states: readonly AttachmentSafetyState[] = [
    "PENDING_UPLOAD",
    "QUARANTINED",
    "CLEAN",
    "REJECTED",
    "DELETED",
  ];
  if (
    attachment.attachmentId.length === 0 ||
    attachment.deploymentId.length === 0 ||
    attachment.threadId.length === 0 ||
    attachment.messageId.length === 0 ||
    attachment.contentRef.length === 0 ||
    attachment.safeDownloadFilename.length === 0 ||
    attachment.safeDownloadFilename.length > MAX_SAFE_FILENAME_LENGTH ||
    hasControlCharacters(attachment.safeDownloadFilename) ||
    attachment.safeDownloadFilename.includes("/") ||
    attachment.safeDownloadFilename.includes("\\") ||
    !Number.isSafeInteger(attachment.sizeBytes) ||
    attachment.sizeBytes <= 0 ||
    !Number.isSafeInteger(attachment.version) ||
    attachment.version <= 0 ||
    !states.includes(attachment.state)
  ) {
    throw new DomainError(
      "INVALID_ATTACHMENT_METADATA",
      "Attachment metadata is invalid.",
    );
  }
  return attachment;
}

export function applyAttachmentScanResult(
  attachment: Attachment,
  scanResultRef: string,
  outcome: AttachmentScanOutcome,
  at: string,
): Attachment {
  const outcomes: readonly AttachmentScanOutcome[] = [
    "CLEAN",
    "MALICIOUS",
    "INDETERMINATE",
  ];
  if (
    scanResultRef.length === 0 ||
    scanResultRef.length > MAX_SCAN_RESULT_REF_LENGTH ||
    hasControlCharacters(scanResultRef) ||
    !outcomes.includes(outcome)
  ) {
    throw new DomainError(
      "INVALID_SCAN_RESULT",
      "Normalized attachment scan result is invalid.",
    );
  }

  if (attachment.lastScanResultRef === scanResultRef) {
    if (attachment.lastScanOutcome === outcome) {
      return attachment;
    }
    throw new DomainError(
      "INVALID_SCAN_RESULT",
      "A replayed scan result reference changed outcome.",
    );
  }

  if (attachment.state !== "QUARANTINED") {
    throw new DomainError(
      "INVALID_ATTACHMENT_STATE",
      "Attachment is not eligible for a scan-state transition.",
    );
  }

  const state: AttachmentSafetyState =
    outcome === "CLEAN"
      ? "CLEAN"
      : outcome === "MALICIOUS"
        ? "REJECTED"
        : "QUARANTINED";

  return {
    ...attachment,
    state,
    version: attachment.version + 1,
    lastScanResultRef: scanResultRef,
    lastScanOutcome: outcome,
    lastScanAt: at,
  };
}

export function requireAttachmentRetrievable(attachment: Attachment): void {
  if (attachment.state !== "CLEAN" || attachment.deletedAt !== undefined) {
    throw new DomainError(
      "INVALID_ATTACHMENT_STATE",
      "Attachment is not eligible for normal retrieval.",
    );
  }
}
