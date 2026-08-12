import { describe, expect, it } from "vitest";

import { getEngineeringStatus } from "../../src/application/status.js";

describe("engineering status", () => {
  it("returns a deterministic non-sensitive prototype status", () => {
    expect(getEngineeringStatus()).toEqual({
      service: "secure-exchange",
      status: "ok",
      baseline: "0.4",
    });
  });
});
