import { describe, expect, it } from "vitest";

import {
  ALLOWED_THREAD_TRANSITIONS,
  transitionThread,
  type ThreadLifecycleState,
} from "../../src/domain/index.js";
import { makeThread } from "../helpers/workflow-fixture.js";

const states = Object.keys(ALLOWED_THREAD_TRANSITIONS) as ThreadLifecycleState[];

describe("thread lifecycle", () => {
  for (const from of states) {
    for (const to of ALLOWED_THREAD_TRANSITIONS[from]) {
      it(`allows ${from} -> ${to}`, () => {
        const thread = makeThread({ state: from, version: 7 });
        const next = transitionThread(thread, to, 7, {
          at: "2026-08-12T13:00:00.000Z",
          ...(to === "COMPLETED"
            ? { dispositionDueAt: "2026-08-19T13:00:00.000Z" }
            : {}),
        });

        expect(next.state).toBe(to);
        expect(next.version).toBe(8);
        expect(next.updatedAt).toBe("2026-08-12T13:00:00.000Z");
        if (to === "COMPLETED") {
          expect(next.completedAt).toBe("2026-08-12T13:00:00.000Z");
          expect(next.dispositionDueAt).toBe("2026-08-19T13:00:00.000Z");
        }
        if (to === "DISPOSED") {
          expect(next.disposedAt).toBe("2026-08-12T13:00:00.000Z");
        }
      });
    }
  }

  it.each([
    ["NEW", "AWAITING_STAFF"],
    ["NEW", "DISPOSED"],
    ["COMPLETED", "IN_PROGRESS"],
    ["EXPIRED", "COMPLETED"],
  ] as const)(
    "rejects %s -> %s",
    (from: ThreadLifecycleState, to: ThreadLifecycleState) => {
      expect(() =>
        transitionThread(makeThread({ state: from }), to, 3, {
          at: "2026-08-12T13:00:00.000Z",
        }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    },
  );

  it("rejects stale expected versions", () => {
    expect(() =>
      transitionThread(makeThread({ version: 4 }), "AWAITING_EXTERNAL", 3, {
        at: "2026-08-12T13:00:00.000Z",
      }),
    ).toThrowError(expect.objectContaining({ code: "STALE_VERSION" }));
  });

  for (const target of states) {
    it(`keeps DISPOSED terminal against ${target}`, () => {
      expect(() =>
        transitionThread(makeThread({ state: "DISPOSED" }), target, 3, {
          at: "2026-08-12T13:00:00.000Z",
        }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_TRANSITION" }));
    });
  }
});
