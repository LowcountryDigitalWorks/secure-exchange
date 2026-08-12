import { describe, expect, it } from "vitest";

import {
  queueAllowsRoutingCategory,
  validateQueue,
  validateRoutingCategory,
} from "../../src/domain/queue.js";
import { makeQueue } from "../helpers/workflow-fixture.js";

describe("queue configuration", () => {
  it("normalizes bounded non-sensitive queue configuration", () => {
    const queue = validateQueue(
      makeQueue({
        displayLabel: "  Synthetic Intake  ",
        allowedRoutingCategories: [" GENERAL ", "RECORDS"],
      }),
    );

    expect(queue.displayLabel).toBe("Synthetic Intake");
    expect(queue.allowedRoutingCategories).toEqual(["GENERAL", "RECORDS"]);
    expect(queueAllowsRoutingCategory(queue, "GENERAL")).toBe(true);
  });

  it("rejects invalid routing category text", () => {
    expect(() => validateRoutingCategory(" \u0000 ")).toThrowError(
      expect.objectContaining({ code: "INVALID_ROUTING_CATEGORY" }),
    );
  });

  it("rejects duplicate queue routing categories after normalization", () => {
    expect(() =>
      validateQueue(
        makeQueue({
          allowedRoutingCategories: ["GENERAL", " GENERAL "],
        }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_QUEUE_CONFIGURATION" }),
    );
  });
});
