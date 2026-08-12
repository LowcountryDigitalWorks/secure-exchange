import { describe, expect, it } from "vitest";

import { recordThreadActivity } from "../../src/domain/thread.js";
import { makeThread } from "../helpers/workflow-fixture.js";

describe("thread activity metadata", () => {
  it("updates activity/version without changing lifecycle or attention semantics", () => {
    const thread = makeThread({
      state: "AWAITING_EXTERNAL",
      version: 5,
      attentionAt: "2026-08-12T12:30:00.000Z",
    });

    const next = recordThreadActivity(
      thread,
      5,
      "2026-08-12T14:00:00.000Z",
    );

    expect(next).toMatchObject({
      state: "AWAITING_EXTERNAL",
      version: 6,
      updatedAt: "2026-08-12T14:00:00.000Z",
      lastActivityAt: "2026-08-12T14:00:00.000Z",
      attentionAt: "2026-08-12T12:30:00.000Z",
    });
  });

  it("rejects stale activity updates", () => {
    expect(() =>
      recordThreadActivity(
        makeThread({ version: 6 }),
        5,
        "2026-08-12T14:00:00.000Z",
      ),
    ).toThrowError(expect.objectContaining({ code: "STALE_VERSION" }));
  });
});
