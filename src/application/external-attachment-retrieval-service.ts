import type {
  AccessGrantId,
  AttachmentId,
  DeploymentId,
  MessageId,
  ThreadId,
} from "../domain/index.js";
import type { AccessGrantService } from "./access-grant-service.js";
import { retrieveAuthorizedAttachment } from "./attachment-retrieval.js";
import type { Clock } from "./clock.js";
import { ApplicationError } from "./errors.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { WorkflowStore } from "./ports.js";
import type { ProtectedContentStore } from "./protected-content.js";

export interface RetrieveExternalAttachmentInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly attachmentId: AttachmentId;
  readonly grantId: AccessGrantId;
  readonly secret: string;
}

export interface ExternalAttachmentRetrievalResult {
  readonly safeDownloadFilename: string;
  readonly normalizedMediaType: string;
  readonly byteLength: number;
  readonly content: Uint8Array;
}

export class ExternalAttachmentRetrievalService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly contentStore: ProtectedContentStore,
    private readonly idGenerator: OpaqueIdGenerator,
    private readonly accessGrants: AccessGrantService,
    private readonly clock: Clock,
  ) {}

  async retrieveExternalAttachment(
    input: RetrieveExternalAttachmentInput,
  ): Promise<ExternalAttachmentRetrievalResult> {
    const authority = await this.accessGrants.validatePresentedAccessGrant({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      grantId: input.grantId,
      secret: input.secret,
      operation: "ATTACHMENT_READ",
    });

    try {
      const result = await retrieveAuthorizedAttachment(
        {
          store: this.store,
          contentStore: this.contentStore,
          idGenerator: this.idGenerator,
        },
        {
          deploymentId: input.deploymentId,
          threadId: input.threadId,
          messageId: input.messageId,
          attachmentId: input.attachmentId,
          at: this.currentTime(),
          expectedThreadVersion: authority.threadVersion,
          authority: {
            actorRef: authority.externalParticipantRef,
            actorKind: "EXTERNAL",
            accessGrantId: authority.grantId,
          },
        },
      );

      return {
        safeDownloadFilename: result.safeDownloadFilename,
        normalizedMediaType: result.normalizedMediaType,
        byteLength: result.byteLength,
        content: result.content,
      };
    } catch {
      throw this.externalAccessDenied();
    }
  }

  private currentTime(): string {
    const now = this.clock.now();
    if (!Number.isFinite(Date.parse(now))) {
      throw new Error("Clock returned an invalid timestamp.");
    }
    return now;
  }

  private externalAccessDenied(): ApplicationError {
    return new ApplicationError(
      "EXTERNAL_ACCESS_DENIED",
      "External access is not available for the presented authority.",
    );
  }
}
