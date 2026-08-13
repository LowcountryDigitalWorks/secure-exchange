import { describe, expect, it } from "vitest";

import { AccessGrantService } from "../../src/application/access-grant-service.js";
import type { Clock } from "../../src/application/clock.js";
import { ApplicationError } from "../../src/application/errors.js";
import type {
  OpaqueIdGenerator,
  OpaqueIdPurpose,
} from "../../src/application/id-generator.js";
import { WorkflowService } from "../../src/application/workflow-service.js";
import { InMemoryWorkflowStore } from "../../src/adapters/in-memory-workflow-store.js";
import { WebCryptoAccessGrantSecretManager } from "../../src/adapters/web-crypto-access-grant-secret.js";
import type { AccessGrantOperation } from "../../src/domain/access-grant.js";
import {
  DEPLOYMENT_A,
  DEPLOYMENT_B,
  EXTERNAL_A,
  QUEUE_A,
  ROUTING_GENERAL,
  STAFF_A,
  THREAD_A,
  actorContext,
  makeAccessGrantPolicy,
  makeActorAuthorization,
  makeMessage,
  makeQueue,
  makeThread,
} from "../helpers/workflow-fixture.js";

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

function fixture(options: {
  readonly clock?: MutableClock;
  readonly actorPermissions?: readonly ReturnType<
    typeof makeActorAuthorization
  >["permissions"];
  readonly threadState?: ReturnType<typeof makeThread>["state"];
} = {}): {
  readonly store: InMemoryWorkflowStore;
  readonly service: AccessGrantService;
  readonly workflow: WorkflowService;
  readonly clock: MutableClock;
} {
  const clock =
    options.clock ?? new MutableClock("2026-08-13T01:00:00.000Z");
  const thread = makeThread({ state: options.threadState ?? "IN_PROGRESS" });
  const messages = [
    makeMessage(),
    makeMessage({
      messageId: "message-2",
      direction: "STAFF_TO_EXTERNAL",
      actorRef: STAFF_A,
      createdAt: "2026-08-13T00:59:00.000Z",
    }),
  ];
  const store = new InMemoryWorkflowStore({
    queues: [makeQueue()],
    threads: [thread],
    messages,
    accessGrantPolicies: [makeAccessGrantPolicy()],
    completionPolicies: [],
    actorAuthorizations: [
      makeActorAuthorization({
        ...(options.actorPermissions === undefined
          ? {}
          : { permissions: options.actorPermissions }),
      }),
    ],
  });
  return {
    store,
    service: new AccessGrantService(
      store,
      new SequenceIdGenerator(),
      new WebCryptoAccessGrantSecretManager(),
      clock,
    ),
    workflow: new WorkflowService(store),
    clock,
  };
}

async function issue(
  service: AccessGrantService,
  overrides: Partial<
    Parameters<AccessGrantService["issueAccessGrant"]>[0]
  > = {},
) {
  return service.issueAccessGrant({
    actor: actorContext(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    requestedOperations: ["THREAD_READ"],
    requestedLifetimeSeconds: 600,
    ...overrides,
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

describe("AccessGrant service", () => {
  it("issues a one-time raw secret while persisting only its verifier", async () => {
    const { store, service } = fixture();
    const issued = await issue(service);
    const stored = await store.getAccessGrant(DEPLOYMENT_A, issued.grantId);

    expect(issued.secret).toMatch(/^sxg1_[A-Za-z0-9_-]{43}$/u);
    expect(stored).toMatchObject({
      grantId: issued.grantId,
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      externalParticipantRef: EXTERNAL_A,
      policyRef: "access-policy-a-v1",
      permittedOperations: ["THREAD_READ"],
      version: 1,
    });
    expect(stored?.verifierDigest).toMatch(/^sha256:v1:[A-Za-z0-9_-]{43}$/u);
    expect(stored?.verifierDigest).not.toBe(issued.secret);

    const audit = JSON.stringify(store.listAuditEvents(DEPLOYMENT_A, THREAD_A));
    expect(audit).not.toContain(issued.secret);
    expect(audit).not.toContain(stored?.verifierDigest ?? "never");
    expect(audit).toContain("ACCESS_GRANT_ISSUED");
  });

  it("enforces bounded issuance lifetime and current staff permission", async () => {
    const { service } = fixture();
    await expectApplicationCode(
      issue(service, { requestedLifetimeSeconds: 3_601 }),
      "ACCESS_GRANT_POLICY_REJECTED",
    );

    const denied = fixture({ actorPermissions: ["THREAD_OPEN"] });
    await expectApplicationCode(
      issue(denied.service),
      "AUTHORIZATION_DENIED",
    );
  });

  it("fails issuance closed for expired or disposed threads", async () => {
    for (const state of ["EXPIRED", "DISPOSED"] as const) {
      const { service } = fixture({ threadState: state });
      await expectApplicationCode(
        issue(service),
        "ACCESS_GRANT_POLICY_REJECTED",
      );
    }
  });

  it("denies a wrong secret and grant ID without secret proof", async () => {
    const { service } = fixture();
    const issued = await issue(service);
    const otherSecret = await new WebCryptoAccessGrantSecretManager().issue();

    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: otherSecret.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: "",
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("denies wrong deployment, thread, and operation conservatively", async () => {
    const { service } = fixture();
    const issued = await issue(service);

    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_B,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: "thread-other",
        grantId: issued.grantId,
        secret: issued.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    await expectApplicationCode(
      service.validatePresentedAccessGrant({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
        operation: "ATTACHMENT_READ" as unknown as AccessGrantOperation,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("uses authoritative server time and fails at expiry without extension", async () => {
    const { service, clock } = fixture();
    const issued = await issue(service, { requestedLifetimeSeconds: 60 });
    expect(issued.expiresAt).toBe("2026-08-13T01:01:00.000Z");

    clock.set("2026-08-13T01:00:59.000Z");
    await expect(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
    ).resolves.toBeDefined();

    clock.set("2026-08-13T01:01:00.000Z");
    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
    expect(issued.expiresAt).toBe("2026-08-13T01:01:00.000Z");
  });

  it("revokes authoritatively and treats a repeated revoke as idempotent", async () => {
    const { store, service, clock } = fixture();
    const issued = await issue(service);
    clock.set("2026-08-13T01:02:00.000Z");

    const first = await service.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: issued.grantId,
      expectedVersion: 1,
    });
    const auditAfterFirst = store.listAuditEvents(DEPLOYMENT_A, THREAD_A);
    const replay = await service.revokeAccessGrant({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: issued.grantId,
      expectedVersion: 1,
    });

    expect(first).toEqual(replay);
    expect(
      auditAfterFirst.filter((event) => event.eventType === "ACCESS_GRANT_REVOKED"),
    ).toHaveLength(1);
    expect(
      store
        .listAuditEvents(DEPLOYMENT_A, THREAD_A)
        .filter((event) => event.eventType === "ACCESS_GRANT_REVOKED"),
    ).toHaveLength(1);
    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("returns an explicit external projection without internal queue or actor metadata", async () => {
    const { store, service } = fixture();
    const issued = await issue(service);
    const beforeThread = await store.getThread(DEPLOYMENT_A, THREAD_A);
    const projection = await service.retrieveExternalConversation({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: issued.grantId,
      secret: issued.secret,
    });

    expect(projection.threadId).toBe(THREAD_A);
    expect(projection.messages).toHaveLength(2);
    expect(projection.messages.map((message) => message.direction)).toEqual([
      "EXTERNAL_TO_STAFF",
      "STAFF_TO_EXTERNAL",
    ]);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(QUEUE_A);
    expect(serialized).not.toContain(STAFF_A);
    expect(serialized).not.toContain(EXTERNAL_A);
    expect(serialized).not.toContain(ROUTING_GENERAL);
    expect(serialized).not.toContain("actorRef");
    expect(serialized).not.toContain("audit");
    expect(await store.getThread(DEPLOYMENT_A, THREAD_A)).toEqual(beforeThread);
    expect(
      await store.listTransferAttestations(DEPLOYMENT_A, THREAD_A),
    ).toEqual([]);
    expect(
      store.listAuditEvents(DEPLOYMENT_A, THREAD_A).map((event) => event.eventType),
    ).toEqual(["ACCESS_GRANT_ISSUED", "EXTERNAL_THREAD_RETRIEVED"]);
  });

  it("revalidates current thread state every time the grant is used", async () => {
    const { service, workflow } = fixture();
    const issued = await issue(service);

    await workflow.transitionThread({
      actor: actorContext(),
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      expectedVersion: 3,
      targetState: "EXPIRED",
      auditEventId: "audit-expire-thread",
      at: "2026-08-13T01:03:00.000Z",
    });

    await expectApplicationCode(
      service.retrieveExternalConversation({
        deploymentId: DEPLOYMENT_A,
        threadId: THREAD_A,
        grantId: issued.grantId,
        secret: issued.secret,
      }),
      "EXTERNAL_ACCESS_DENIED",
    );
  });

  it("keeps AccessGrant use distinct from completion and TransferAttestation", async () => {
    const { store, service } = fixture();
    const issued = await issue(service);
    const before = await store.getThread(DEPLOYMENT_A, THREAD_A);

    await service.retrieveExternalConversation({
      deploymentId: DEPLOYMENT_A,
      threadId: THREAD_A,
      grantId: issued.grantId,
      secret: issued.secret,
    });

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
