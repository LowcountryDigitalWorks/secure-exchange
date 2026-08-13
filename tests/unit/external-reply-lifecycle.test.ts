import { describe, expect, it } from "vitest";

import { DomainError } from "../../src/domain/errors.js";
import {
  isExternalReplyAllowed,
  recordExternalThreadActivity,
  requireExternalReplyAllowed,
} from "../../src/domain/thread.js";
import { makeThread } from "../helpers/workflow-fixture.js";

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

describe("external reply lifecycle", () => {
  it("allows only active conversational states and denies completed/terminal states", () => {
    for (const state of [
      "NEW",
      "IN_PROGRESS",
      "AWAITING_EXTERNAL",
      "AWAITING_STAFF",
    ] as const) {
      expect(isExternalReplyAllowed(state)).toBe(true);
      expect(() => requireExternalReplyAllowed(makeThread({ state }))).not.toThrow();
    }

    for (const state of ["COMPLETED", "EXPIRED", "DISPOSED"] as const) {
      expect(isExternalReplyAllowed(state)).toBe(false);
      expectDomainCode(
        () => requireExternalReplyAllowed(makeThread({ state })),
        "REPLY_NOT_ALLOWED",
      );
    }
  });

  it("records external activity and staff attention without changing lifecycle", () => {
    const thread = makeThread({
      state: "AWAITING_EXTERNAL",
      version: 7,
      updatedAt: "2026-08-13T01:00:00.000Z",
      lastActivityAt: "2026-08-13T01:00:00.000Z",
      attentionAt: "2026-08-13T00:50:00.000Z",
    });

    const next = recordExternalThreadActivity(
      thread,
      7,
      "2026-08-13T01:05:00.000Z",
    );

    expect(next).toMatchObject({
      state: "AWAITING_EXTERNAL",
      version: 8,
      updatedAt: "2026-08-13T01:05:00.000Z",
      lastActivityAt: "2026-08-13T01:05:00.000Z",
      attentionAt: "2026-08-13T01:05:00.000Z",
    });
    expectDomainCode(
      () =>
        recordExternalThreadActivity(
          thread,
          6,
          "2026-08-13T01:05:00.000Z",
        ),
      "STALE_VERSION",
    );
  });
});
