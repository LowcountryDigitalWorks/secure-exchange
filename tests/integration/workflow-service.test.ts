import { describe, expect, it } from "vitest";

import { DomainError } from "../../src/domain/errors.js";
import type {
  ActorAuthorization,
  AuditEvent,
  Thread,
  TransferAttestation,
} from "../../src/domain/index.js";
import { ApplicationError } from "../../src/application/errors.js";
import { WorkflowService } from "../../src/application/workflow-service.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import {
  ALL_WORKFLOW_PERMISSIONS,
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  POLICY_A,
  QUEUE_A,
  STAFF_A,
  STAFF_B,
  THREAD_A,
  THREAD_B,
  UNAUTHORIZED_STAFF,
  actorContext,
  makeActorAuthorization,
  makeAttestation,
  makeCompletionPolicy,
  makeFixture,
  makeThread,
} from "../helpers/workflow-fixture.js";

async function expectApplicationError(
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

function seedStore(options: {
  readonly threads?: readonly Thread[];
  readonly actors?: readonly ActorAuthorization[];
  readonly attestations?: readonly TransferAttestation[];
  readonly auditEvents?: readonly AuditEvent[];
} = {}): InMemoryWorkflowStore {
  return new InMemoryWorkflowStore({
    threads: options.threads ?? [makeThread()],
    completionPolicies: [makeCompletionPolicy()],
    actorAuthorizations: options.actors ?? [makeActorAuthorization()],
    ...(options.attestations === undefined
      ? {}
      : { transferAttestations: options.attestations }),
    ...(options.auditEvents === undefined
      ? {}
      : { auditEvents: options.auditEvents }),
  });
}

describe("workflow service", () => {
  it("records Opened distinctly without creating Downloaded evidence", async () => {
    const { store, service } = makeFixture();

    await service.recordOpened({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-opened",
      at: "2026-08-12T13:00:00.000Z",
    });

    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({
        eventType: "THREAD_OPENED",
        eventId: "audit-opened",
      }),
    ]);
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .some((event) => event.eventType === "ATTACHMENT_DOWNLOADED"),
    ).toBe(false);
    expect(await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A)).toEqual(
      [],
    );
  });

  it("records Downloaded distinctly without creating TransferAttestation", async () => {
    const { store, service } = makeFixture();

    await service.recordDownloadEvidence({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-download",
      attachmentId: "attachment-synthetic",
      at: "2026-08-12T13:01:00.000Z",
    });

    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({
        eventType: "ATTACHMENT_DOWNLOADED",
        attachmentId: "attachment-synthetic",
      }),
    ]);
    expect(await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A)).toEqual(
      [],
    );
  });

  it("appends TransferAttestation without completing the thread", async () => {
    const { store, service } = makeFixture();

    await service.appendTransferAttestation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-attest",
      attestationId: "attestation-created",
      at: "2026-08-12T13:02:00.000Z",
      outcome: "TRANSFERRED",
      destinationCategory: "RECORD_SYSTEM",
    });

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      state: "IN_PROGRESS",
      version: 3,
    });
    expect(await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({
        attestationId: "attestation-created",
        completionPolicyRef: POLICY_A,
      }),
    ]);
  });

  it("completes only after a qualifying required attestation exists", async () => {
    const { store, service } = makeFixture();

    await service.appendTransferAttestation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-attest",
      attestationId: "attestation-created",
      at: "2026-08-12T13:02:00.000Z",
      outcome: "FILED",
      destinationCategory: "ARCHIVE",
    });

    const completed = await service.completeThread({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-complete",
      expectedVersion: 3,
      at: "2026-08-12T13:03:00.000Z",
      dispositionDueAt: "2026-08-19T13:03:00.000Z",
    });

    expect(completed).toMatchObject({
      state: "COMPLETED",
      version: 4,
      completedAt: "2026-08-12T13:03:00.000Z",
      dispositionDueAt: "2026-08-19T13:03:00.000Z",
    });
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([
      expect.objectContaining({ eventType: "TRANSFER_ATTESTED" }),
      expect.objectContaining({
        eventType: "THREAD_COMPLETED",
        attestationId: "attestation-created",
      }),
    ]);
  });

  it("fails completion closed when required attestation is missing", async () => {
    const { service } = makeFixture();

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:03:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("rejects failed attestation for completion", async () => {
    const { service } = makeFixture({
      attestations: [makeAttestation({ outcome: "FAILED" })],
    });

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:03:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("supersedes evidence explicitly and does not let the old record qualify", async () => {
    const { store, service } = makeFixture({ attestations: [makeAttestation()] });

    await service.supersedeTransferAttestation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-replacement",
      supersedeAuditEventId: "audit-supersede",
      attestationId: "attestation-replacement",
      targetAttestationId: "attestation-1",
      controlId: "control-supersede",
      reasonCode: "CORRECTION",
      at: "2026-08-12T13:04:00.000Z",
      outcome: "FAILED",
      destinationCategory: "RECORD_SYSTEM",
    });

    expect(
      await store.listTransferAttestationControls(DEPLOYMENT_A, THREAD_A),
    ).toEqual([
      expect.objectContaining({
        action: "SUPERSEDE",
        targetAttestationId: "attestation-1",
        replacementAttestationId: "attestation-replacement",
      }),
    ]);

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:05:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("invalidates evidence explicitly so it no longer qualifies", async () => {
    const { service } = makeFixture({ attestations: [makeAttestation()] });

    await service.invalidateTransferAttestation({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-invalidate",
      targetAttestationId: "attestation-1",
      controlId: "control-invalidate",
      reasonCode: "ENTERED_IN_ERROR",
      at: "2026-08-12T13:04:00.000Z",
    });

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:05:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("does not accept wrong-thread attestation evidence", async () => {
    const { service } = makeFixture({
      attestations: [makeAttestation({ threadId: THREAD_B })],
    });

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:05:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("does not accept wrong-deployment attestation evidence", async () => {
    const { service } = makeFixture({
      attestations: [makeAttestation({ deploymentId: DEPLOYMENT_B })],
    });

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:05:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("does not accept evidence from an actor without authoritative permission", async () => {
    const unauthorizedAttestation = makeAttestation({
      actorRef: UNAUTHORIZED_STAFF,
    });
    const { service } = makeFixture({
      attestations: [unauthorizedAttestation],
      additionalActors: [
        makeActorAuthorization({
          actorRef: UNAUTHORIZED_STAFF,
          permissions: ["THREAD_OPEN"],
        }),
      ],
    });

    await expectApplicationError(
      service.completeThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-complete",
        expectedVersion: 3,
        at: "2026-08-12T13:05:00.000Z",
      }),
      "COMPLETION_PRECONDITION_FAILED",
    );
  });

  it("enforces deployment ownership before authoritative mutation", async () => {
    const { service } = makeFixture();

    await expectApplicationError(
      service.transitionThread({
        actor: actorContext({ deploymentId: DEPLOYMENT_B }),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "AWAITING_EXTERNAL",
        at: "2026-08-12T13:05:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("enforces authoritative queue scope instead of identifier possession", async () => {
    const store = seedStore({
      actors: [
        makeActorAuthorization({
          actorRef: STAFF_A,
          allowedQueueIds: ["different-queue"],
        }),
      ],
    });
    const service = new WorkflowService(store);

    await expectApplicationError(
      service.transitionThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "AWAITING_EXTERNAL",
        at: "2026-08-12T13:05:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("fails closed when the requested action permission is absent", async () => {
    const store = seedStore({
      actors: [
        makeActorAuthorization({
          actorRef: STAFF_A,
          permissions: ["THREAD_OPEN"],
        }),
      ],
    });
    const service = new WorkflowService(store);

    await expectApplicationError(
      service.transitionThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "AWAITING_EXTERNAL",
        at: "2026-08-12T13:05:00.000Z",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("requires the completion path instead of generic transition to COMPLETED", async () => {
    const { service } = makeFixture();

    await expectApplicationError(
      service.transitionThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "COMPLETED",
        at: "2026-08-12T13:05:00.000Z",
      }),
      "USE_COMPLETION_SERVICE",
    );
  });

  it("rejects stale lifecycle transitions", async () => {
    const { service } = makeFixture({ threadVersion: 4 });

    try {
      await service.transitionThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "AWAITING_EXTERNAL",
        at: "2026-08-12T13:05:00.000Z",
      });
      throw new Error("Expected stale version error.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("STALE_VERSION");
    }
  });

  it("rolls back thread mutation and audit together on transaction failure", async () => {
    const { store, service } = makeFixture();
    store.failNextCommit();

    await expect(
      service.transitionThread({
        actor: actorContext(),
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        auditEventId: "audit-transition",
        expectedVersion: 3,
        targetState: "AWAITING_EXTERNAL",
        at: "2026-08-12T13:05:00.000Z",
      }),
    ).rejects.toThrow("Synthetic transaction failure");

    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toMatchObject({
      state: "IN_PROGRESS",
      version: 3,
    });
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toEqual([]);
  });

  it("keeps synthetic deployments isolated", async () => {
    const threadB = makeThread({
      deploymentId: DEPLOYMENT_B,
      threadId: THREAD_B,
      queueId: QUEUE_A,
    });
    const actorB = makeActorAuthorization({
      actorRef: STAFF_B,
      deploymentId: DEPLOYMENT_B,
      permissions: ALL_WORKFLOW_PERMISSIONS,
    });
    const store = new InMemoryWorkflowStore({
      threads: [makeThread(), threadB],
      completionPolicies: [
        makeCompletionPolicy(),
        makeCompletionPolicy({
          deploymentId: DEPLOYMENT_B,
          policyRef: "completion-policy-b-v1",
        }),
      ],
      actorAuthorizations: [makeActorAuthorization(), actorB],
    });
    const service = new WorkflowService(store);

    await service.recordOpened({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      auditEventId: "audit-a",
      at: "2026-08-12T13:06:00.000Z",
    });
    await service.recordOpened({
      actor: actorContext({
        actorRef: STAFF_B,
        deploymentId: DEPLOYMENT_B,
      }),
      deploymentId: DEPLOYMENT_B,
      threadId: THREAD_B,
      auditEventId: "audit-b",
      at: "2026-08-12T13:06:00.000Z",
    });

    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_A)).toHaveLength(1);
    expect(store.listAuditEvents(DEPLOYMENT_B, THREAD_B)).toHaveLength(1);
    expect(store.listAuditEvents(DEPLOYMENT_A, THREAD_B)).toEqual([]);
    expect(await store.getThread(DEPLOYMENT_B, THREAD_A)).toBeUndefined();
  });
});
