import {
  requireAttachmentRetrievable,
  type AccessGrantId,
  type ActorRef,
  type AttachmentId,
  type AttachmentMediaCategory,
  type AuditActorKind,
  type DeploymentId,
  type MessageId,
  type ThreadId,
} from "../domain/index.js";
import { ApplicationError } from "./errors.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { WorkflowStore } from "./ports.js";
import type { ProtectedContentStore } from "./protected-content.js";

export interface AttachmentRetrievalAuthority {
  readonly actorRef: ActorRef;
  readonly actorKind: AuditActorKind;
  readonly accessGrantId?: AccessGrantId;
}

export interface AuthorizedAttachmentResolutionInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
}

export interface AuthorizedAttachmentRetrievalInput extends AuthorizedAttachmentResolutionInput {
  readonly at: string;
  readonly expectedThreadVersion: number;
  readonly authority: AttachmentRetrievalAuthority;
}

export interface AuthorizedAttachmentResolutionResult {
  readonly attachmentId: AttachmentId;
  readonly safeDownloadFilename: string;
  readonly normalizedMediaType: string;
  readonly normalizedMediaCategory: AttachmentMediaCategory;
  readonly byteLength: number;
  readonly content: Uint8Array;
}

export type AuthorizedAttachmentRetrievalResult =
  AuthorizedAttachmentResolutionResult;

export interface AttachmentRetrievalDependencies {
  readonly store: WorkflowStore;
  readonly contentStore: ProtectedContentStore;
  readonly idGenerator: OpaqueIdGenerator;
}

export async function resolveAuthorizedAttachment(
  dependencies: Pick<AttachmentRetrievalDependencies, "store" | "contentStore">,
  input: AuthorizedAttachmentResolutionInput,
): Promise<AuthorizedAttachmentResolutionResult> {
  const message = await dependencies.store.getMessage(
    input.deploymentId,
    input.threadId,
    input.messageId,
  );
  if (
    message?.deploymentId !== input.deploymentId ||
    message.threadId !== input.threadId
  ) {
    throw new ApplicationError(
      "RESOURCE_NOT_FOUND",
      "Authoritative message was not found in the requested thread.",
    );
  }

  const attachment = await dependencies.store.getAttachment(
    input.deploymentId,
    input.attachmentId,
  );
  if (
    attachment?.deploymentId !== input.deploymentId ||
    attachment.threadId !== input.threadId ||
    attachment.messageId !== message.messageId
  ) {
    throw new ApplicationError(
      "ATTACHMENT_NOT_FOUND",
      "Authoritative attachment was not found in the requested scope.",
    );
  }

  try {
    requireAttachmentRetrievable(attachment);
  } catch {
    throw new ApplicationError(
      "ATTACHMENT_NOT_RETRIEVABLE",
      "Attachment is not eligible for normal retrieval.",
    );
  }

  let content: Uint8Array | undefined;
  try {
    content = await dependencies.contentStore.get(attachment.contentRef);
  } catch {
    throw new ApplicationError(
      "CONTENT_NOT_AVAILABLE",
      "Protected attachment content could not be resolved.",
    );
  }
  if (content?.byteLength !== attachment.sizeBytes) {
    throw new ApplicationError(
      "CONTENT_NOT_AVAILABLE",
      "Protected attachment content is unavailable or inconsistent.",
    );
  }

  return {
    attachmentId: attachment.attachmentId,
    safeDownloadFilename: attachment.safeDownloadFilename,
    normalizedMediaType: attachment.normalizedMediaType,
    normalizedMediaCategory: attachment.normalizedMediaCategory,
    byteLength: content.byteLength,
    content: new Uint8Array(content),
  };
}

export async function retrieveAuthorizedAttachment(
  dependencies: AttachmentRetrievalDependencies,
  input: AuthorizedAttachmentRetrievalInput,
): Promise<AuthorizedAttachmentRetrievalResult> {
  const result = await resolveAuthorizedAttachment(dependencies, input);

  await dependencies.store.commit({
    deploymentId: input.deploymentId,
    threadId: input.threadId,
    expectedThreadVersion: input.expectedThreadVersion,
    auditEvents: [
      {
        eventId: dependencies.idGenerator.generate("audit"),
        deploymentId: input.deploymentId,
        threadId: input.threadId,
        eventType: "ATTACHMENT_DOWNLOADED",
        actorRef: input.authority.actorRef,
        actorKind: input.authority.actorKind,
        at: input.at,
        attachmentId: result.attachmentId,
        ...(input.authority.accessGrantId === undefined
          ? {}
          : { accessGrantId: input.authority.accessGrantId }),
        outcome: "SUCCEEDED",
      },
    ],
  });

  return result;
}
