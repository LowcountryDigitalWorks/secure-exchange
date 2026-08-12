import { describe, expect, it } from "vitest";

import {
  evaluateCompletionPolicy,
  type TransferAttestationControl,
} from "../../src/domain/index.js";
import {
  DEPLOYMENT_A,
  POLICY_A,
  STAFF_A,
  THREAD_A,
  makeAttestation,
  makeCompletionPolicy,
} from "../helpers/workflow-fixture.js";

function evaluate(options: {
  readonly attestation?: ReturnType<typeof makeAttestation>;
  readonly controls?: readonly TransferAttestationControl[];
  readonly authorizedActors?: readonly string[];
  readonly policy?: ReturnType<typeof makeCompletionPolicy>;
} = {}) {
  return evaluateCompletionPolicy({
    policy: options.policy ?? makeCompletionPolicy(),
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    attestations: options.attestation === undefined ? [] : [options.attestation],
    controls: options.controls ?? [],
    authorizedAttestationActorRefs: new Set(
      options.authorizedActors ?? [STAFF_A],
    ),
  });
}

describe("completion policy", () => {
  it("permits completion when transfer evidence is not required", () => {
    expect(
      evaluate({
        policy: makeCompletionPolicy({ requiresTransferAttestation: false }),
      }),
    ).toEqual({ allowed: true });
  });

  it("accepts a current successful attestation", () => {
    expect(evaluate({ attestation: makeAttestation() })).toEqual({
      allowed: true,
      qualifyingAttestationId: "attestation-1",
    });
  });

  it.each([
    makeAttestation({ outcome: "FAILED" }),
    makeAttestation({ threadId: "wrong-thread" }),
    makeAttestation({ deploymentId: "wrong-deployment" }),
    makeAttestation({ completionPolicyRef: "wrong-policy" }),
    makeAttestation({ destinationCategory: "UNAPPROVED" }),
  ])(
    "rejects non-qualifying attestation %#",
    (attestation: ReturnType<typeof makeAttestation>) => {
      expect(evaluate({ attestation })).toEqual({
        allowed: false,
        reason: "QUALIFYING_TRANSFER_ATTESTATION_REQUIRED",
      });
    },
  );

  it("rejects evidence from an unauthorized actor", () => {
    expect(
      evaluate({
        attestation: makeAttestation({ actorRef: "unauthorized" }),
        authorizedActors: [],
      }),
    ).toEqual({
      allowed: false,
      reason: "QUALIFYING_TRANSFER_ATTESTATION_REQUIRED",
    });
  });

  it.each(["SUPERSEDE", "INVALIDATE"] as const)(
    "rejects an attestation controlled by %s",
    (action: "SUPERSEDE" | "INVALIDATE") => {
      expect(
        evaluate({
          attestation: makeAttestation(),
          controls: [
            {
              controlId: `control-${action}`,
              deploymentId: DEPLOYMENT_A,
              threadId: THREAD_A,
              targetAttestationId: "attestation-1",
              actorRef: STAFF_A,
              at: "2026-08-12T12:10:00.000Z",
              action,
              reasonCode: "CORRECTION",
              ...(action === "SUPERSEDE"
                ? { replacementAttestationId: "replacement" }
                : {}),
            },
          ],
        }),
      ).toEqual({
        allowed: false,
        reason: "QUALIFYING_TRANSFER_ATTESTATION_REQUIRED",
      });
    },
  );

  it("fails closed on ambiguous required-attestation policy", () => {
    expect(
      evaluate({
        attestation: makeAttestation(),
        policy: makeCompletionPolicy({ allowedDestinationCategories: [] }),
      }),
    ).toEqual({ allowed: false, reason: "INVALID_POLICY" });
  });

  it("fails closed when the policy belongs to another deployment", () => {
    expect(
      evaluate({
        attestation: makeAttestation(),
        policy: makeCompletionPolicy({
          deploymentId: "wrong-deployment",
          policyRef: POLICY_A,
        }),
      }),
    ).toEqual({ allowed: false, reason: "INVALID_POLICY" });
  });
});
