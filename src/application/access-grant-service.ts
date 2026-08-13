import {
  createPlainTextMessageBody,
  isExternalAccessThreadEligible,
  isExternalReplyAllowed,
  recordExternalThreadActivity,
  revokeAccessGrant,
  validateAccessGrant,
  validateAccessGrantPolicy,
  type AccessGrant,
  type AccessGrantId,
  type AccessGrantOperation,
  type ActorAuthorization,
  type ActorContext,
  type AuditEvent,
  type DeploymentId,
  type ExternalParticipantRef,
  type Message,
  type Thread,
  type ThreadId,
  type WorkflowPermission,
} from "../domain/index.js";
import type { AccessGrantSecretManager } from "./access-grant-secret.js";
import type { Clock } from "./clock.js";
import { ApplicationError } from "./errors.js";
import type { OpaqueIdGenerator } from "./id-generator.js";
import type { WorkflowStore } from "./ports.js";

export interface IssueAccessGrantInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly requestedOperations: readonly AccessGrantOperation[];
  readonly requestedLifetimeSeconds: number;
}

export interface IssuedAccessGrant {
  readonly grantId: AccessGrantId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly permittedOperations: readonly AccessGrantOperation[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly secret: string;
}

export interface RevokeAccessGrantInput {
  readonly actor: ActorContext;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly grantId: AccessGrantId;
  readonly expectedVersion: number;
}

export interface RevokedAccessGrant {
  readonly grantId: AccessGrantId;
  readonly revokedAt: string;
  readonly version: number;
}

export interface PresentedAccessGrant {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly grantId: AccessGrantId;
  readonly secret: string;
  readonly operation: AccessGrantOperation;
}

export interface ValidatedExternalAuthority {
  readonly grantId: AccessGrantId;
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly externalParticipantRef: ExternalParticipantRef;
  readonly operation: AccessGrantOperation;
  readonly threadVersion: number;
}

export interface RetrieveExternalConversationInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly grantId: AccessGrantId;
  readonly secret: string;
}

export interface ExternalConversationMessage {
  readonly direction: "EXTERNAL_TO_STAFF" | "STAFF_TO_EXTERNAL";
  readonly createdAt: string;
  readonly body: {
    readonly kind: "PLAIN_TEXT";
    readonly text: string;
  };
}

export interface ExternalConversationProjection {
  readonly threadId: ThreadId;
  readonly messages: readonly ExternalConversationMessage[];
}

export interface ReplyExternalConversationInput {
  readonly deploymentId: DeploymentId;
  readonly threadId: ThreadId;
  readonly grantId: AccessGrantId;
  readonly secret: string;
  readonly messageBody: string;
}

export interface ExternalReplyReceipt {
  readonly threadId: ThreadId;
  readonly createdAt: string;
}

interface AuthorizedThread {
  readonly thread: Thread;
  readonly authorization: ActorAuthorization;
}

interface ValidatedGrantRecord {
  readonly grant: AccessGrant;
  readonly thread: Thread;
}

export class AccessGrantService {
  constructor(
    private readonly store: WorkflowStore,
    private readonly idGenerator: OpaqueIdGenerator,
    private readonly secrets: AccessGrantSecretManager,
    private readonly clock: Clock,
  ) {}

  async issueAccessGrant(
    input: IssueAccessGrantInput,
  ): Promise<IssuedAccessGrant> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "ACCESS_GRANT_ISSUE",
    );
    if (
      authorization.actorKind !== "STAFF" &&
      authorization.actorKind !== "ADMIN"
    ) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "AccessGrant issuance requires an authorized staff or admin actor.",
      );
    }
    if (!isExternalAccessThreadEligible(thread.state)) {
      throw new ApplicationError(
        "ACCESS_GRANT_POLICY_REJECTED",
        "Thread is not eligible for external access.",
      );
    }

    const policy = await this.store.getCurrentAccessGrantPolicy(
      input.deploymentId,
    );
    if (policy?.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "ACCESS_GRANT_POLICY_NOT_FOUND",
        "Current AccessGrant policy is unavailable for the deployment.",
      );
    }
    validateAccessGrantPolicy(policy);

    const requestedOperations = [...new Set(input.requestedOperations)];
    if (
      requestedOperations.length === 0 ||
      requestedOperations.length !== input.requestedOperations.length ||
      requestedOperations.some(
        (operation) => !policy.allowedOperations.includes(operation),
      ) ||
      !Number.isSafeInteger(input.requestedLifetimeSeconds) ||
      input.requestedLifetimeSeconds <= 0 ||
      input.requestedLifetimeSeconds > policy.maxLifetimeSeconds
    ) {
      throw new ApplicationError(
        "ACCESS_GRANT_POLICY_REJECTED",
        "Requested AccessGrant authority is outside the current policy.",
      );
    }
    if (
      requestedOperations.includes("THREAD_REPLY") &&
      !isExternalReplyAllowed(thread.state)
    ) {
      throw new ApplicationError(
        "ACCESS_GRANT_POLICY_REJECTED",
        "Requested reply authority is unavailable for the current thread state.",
      );
    }

    const externalParticipantRef = await this.loadExternalParticipantRef(
      input.deploymentId,
      input.threadId,
    );
    const issuedAt = this.currentTime();
    const expiresAtMs =
      Date.parse(issuedAt) + input.requestedLifetimeSeconds * 1_000;
    if (!Number.isFinite(expiresAtMs)) {
      throw new ApplicationError(
        "ACCESS_GRANT_POLICY_REJECTED",
        "Requested AccessGrant expiry is invalid.",
      );
    }
    const expiresAt = new Date(expiresAtMs).toISOString();
    const secretMaterial = await this.secrets.issue();
    const grant: AccessGrant = validateAccessGrant({
      grantId: this.idGenerator.generate("access-grant"),
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      externalParticipantRef,
      policyRef: policy.policyRef,
      verifierDigest: secretMaterial.verifierDigest,
      permittedOperations: requestedOperations,
      issuedAt,
      expiresAt,
      version: 1,
    });

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: thread.version,
      newAccessGrants: [grant],
      auditEvents: [
        this.staffGrantAudit(
          input,
          authorization,
          grant,
          "ACCESS_GRANT_ISSUED",
          issuedAt,
        ),
      ],
    });

    return {
      grantId: grant.grantId,
      deploymentId: grant.deploymentId,
      threadId: grant.threadId,
      permittedOperations: grant.permittedOperations,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      secret: secretMaterial.secret,
    };
  }

  async revokeAccessGrant(
    input: RevokeAccessGrantInput,
  ): Promise<RevokedAccessGrant> {
    const { thread, authorization } = await this.loadAuthorizedThread(
      input,
      "ACCESS_GRANT_REVOKE",
    );
    const current = await this.store.getAccessGrant(
      input.deploymentId,
      input.grantId,
    );
    if (
      current?.deploymentId !== input.deploymentId ||
      current.threadId !== input.threadId
    ) {
      throw new ApplicationError(
        "ACCESS_GRANT_NOT_FOUND",
        "AccessGrant was not found in the requested authoritative scope.",
      );
    }

    if (current.revokedAt !== undefined) {
      return {
        grantId: current.grantId,
        revokedAt: current.revokedAt,
        version: current.version,
      };
    }

    const revokedAt = this.currentTime();
    const next = revokeAccessGrant(current, input.expectedVersion, revokedAt);
    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: thread.version,
      accessGrantUpdates: [
        {
          expectedVersion: current.version,
          accessGrant: next,
        },
      ],
      auditEvents: [
        this.staffGrantAudit(
          input,
          authorization,
          next,
          "ACCESS_GRANT_REVOKED",
          revokedAt,
        ),
      ],
    });

    return {
      grantId: next.grantId,
      revokedAt,
      version: next.version,
    };
  }

  async retrieveExternalConversation(
    input: RetrieveExternalConversationInput,
  ): Promise<ExternalConversationProjection> {
    const authority = await this.validatePresentedAccessGrant({
      ...input,
      operation: "THREAD_READ",
    });
    const messages = await this.store.listMessages(
      input.deploymentId,
      input.threadId,
    );
    const projection: ExternalConversationProjection = {
      threadId: input.threadId,
      messages: messages.map((message) => ({
        direction: message.direction,
        createdAt: message.createdAt,
        body: {
          kind: message.body.kind,
          text: message.body.text,
        },
      })),
    };

    await this.store.commit({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      expectedThreadVersion: authority.threadVersion,
      auditEvents: [
        {
          eventId: this.idGenerator.generate("audit"),
          deploymentId: input.deploymentId,
          threadId: input.threadId,
          eventType: "EXTERNAL_THREAD_RETRIEVED",
          actorRef: authority.externalParticipantRef,
          actorKind: "EXTERNAL",
          at: this.currentTime(),
          accessGrantId: authority.grantId,
          outcome: "SUCCEEDED",
        },
      ],
    });

    return projection;
  }

  async replyExternalConversation(
    input: ReplyExternalConversationInput,
  ): Promise<ExternalReplyReceipt> {
    const { grant, thread } = await this.validatePresentedGrantRecord({
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      grantId: input.grantId,
      secret: input.secret,
      operation: "THREAD_REPLY",
    });
    if (!isExternalReplyAllowed(thread.state)) {
      throw this.externalAccessDenied();
    }

    const at = this.currentTime();
    const message: Message = {
      messageId: this.idGenerator.generate("message"),
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      direction: "EXTERNAL_TO_STAFF",
      actorRef: grant.externalParticipantRef,
      createdAt: at,
      body: createPlainTextMessageBody(input.messageBody),
    };
    const nextThread = recordExternalThreadActivity(
      thread,
      thread.version,
      at,
    );

    try {
      await this.store.commit({
        deploymentId: input.deploymentId,
        threadId: input.threadId,
        expectedThreadVersion: thread.version,
        nextThread,
        messages: [message],
        auditEvents: [
          {
            eventId: this.idGenerator.generate("audit"),
            deploymentId: input.deploymentId,
            threadId: input.threadId,
            eventType: "MESSAGE_APPENDED",
            actorRef: grant.externalParticipantRef,
            actorKind: "EXTERNAL",
            at,
            messageId: message.messageId,
            accessGrantId: grant.grantId,
            outcome: "SUCCEEDED",
          },
        ],
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "STALE_VERSION"
      ) {
        throw this.externalAccessDenied();
      }
      throw error;
    }

    return {
      threadId: input.threadId,
      createdAt: at,
    };
  }

  async validatePresentedAccessGrant(
    input: PresentedAccessGrant,
  ): Promise<ValidatedExternalAuthority> {
    const { grant, thread } = await this.validatePresentedGrantRecord(input);
    return {
      grantId: grant.grantId,
      deploymentId: grant.deploymentId,
      threadId: grant.threadId,
      externalParticipantRef: grant.externalParticipantRef,
      operation: input.operation,
      threadVersion: thread.version,
    };
  }

  private async validatePresentedGrantRecord(
    input: PresentedAccessGrant,
  ): Promise<ValidatedGrantRecord> {
    const grant = await this.store.getAccessGrant(
      input.deploymentId,
      input.grantId,
    );
    if (
      grant?.deploymentId !== input.deploymentId ||
      grant.threadId !== input.threadId
    ) {
      throw this.externalAccessDenied();
    }

    try {
      validateAccessGrant(grant);
    } catch {
      throw this.externalAccessDenied();
    }

    const secretMatches = await this.secrets
      .matches(input.secret, grant.verifierDigest)
      .catch(() => false);
    if (!secretMatches) {
      throw this.externalAccessDenied();
    }

    const now = Date.parse(this.currentTime());
    if (
      grant.revokedAt !== undefined ||
      !Number.isFinite(now) ||
      now >= Date.parse(grant.expiresAt) ||
      !grant.permittedOperations.includes(input.operation)
    ) {
      throw this.externalAccessDenied();
    }

    const thread = await this.store.getThread(
      input.deploymentId,
      input.threadId,
    );
    if (
      thread?.deploymentId !== input.deploymentId ||
      thread.threadId !== grant.threadId ||
      !isExternalAccessThreadEligible(thread.state)
    ) {
      throw this.externalAccessDenied();
    }

    return { grant, thread };
  }

  private async loadAuthorizedThread(
    input: {
      readonly actor: ActorContext;
      readonly deploymentId: DeploymentId;
      readonly threadId: ThreadId;
    },
    permission: WorkflowPermission,
  ): Promise<AuthorizedThread> {
    if (input.actor.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor deployment does not match the requested deployment.",
      );
    }
    const thread = await this.store.getThread(
      input.deploymentId,
      input.threadId,
    );
    if (thread?.deploymentId !== input.deploymentId) {
      throw new ApplicationError(
        "RESOURCE_NOT_FOUND",
        "Authoritative thread was not found in the requested deployment.",
      );
    }
    const authorization = await this.store.getActorAuthorization(
      input.deploymentId,
      input.actor.actorRef,
    );
    if (
      authorization?.active !== true ||
      authorization.deploymentId !== input.deploymentId ||
      authorization.actorKind !== input.actor.actorKind ||
      !authorization.allowedQueueIds.includes(thread.queueId) ||
      !authorization.permissions.includes(permission)
    ) {
      throw new ApplicationError(
        "AUTHORIZATION_DENIED",
        "Actor is not authorized for this authoritative AccessGrant action.",
      );
    }
    return { thread, authorization };
  }

  private async loadExternalParticipantRef(
    deploymentId: DeploymentId,
    threadId: ThreadId,
  ): Promise<ExternalParticipantRef> {
    const messages = await this.store.listMessages(deploymentId, threadId);
    const references = [
      ...new Set(
        messages
          .filter((message) => message.direction === "EXTERNAL_TO_STAFF")
          .map((message) => message.actorRef),
      ),
    ];
    if (references.length !== 1 || references[0] === undefined) {
      throw new ApplicationError(
        "ACCESS_GRANT_TARGET_NOT_AVAILABLE",
        "An unambiguous external participant is not available for this thread.",
      );
    }
    return references[0];
  }

  private staffGrantAudit(
    input: { readonly deploymentId: DeploymentId; readonly threadId: ThreadId },
    authorization: ActorAuthorization,
    grant: AccessGrant,
    eventType: AuditEvent["eventType"],
    at: string,
  ): AuditEvent {
    return {
      eventId: this.idGenerator.generate("audit"),
      deploymentId: input.deploymentId,
      threadId: input.threadId,
      eventType,
      actorRef: authorization.actorRef,
      actorKind: authorization.actorKind,
      at,
      accessGrantId: grant.grantId,
      outcome: "SUCCEEDED",
    };
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
