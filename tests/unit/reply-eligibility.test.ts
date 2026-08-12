import { describe, expect, it } from "vitest";

import {
  STAFF_REPLY_ALLOWED_STATES,
  isStaffReplyAllowed,
  requireStaffReplyAllowed,
  type ThreadLifecycleState,
} from "../../src/domain/index.js";
import { makeThread } from "../helpers/workflow-fixture.js";

const prohibitedStates: readonly ThreadLifecycleState[] = [
  "COMPLETED",
  "EXPIRED",
  "DISPOSED",
];

describe("staff reply lifecycle eligibility", () => {
  it.each(STAFF_REPLY_ALLOWED_STATES)("allows staff reply in %s", (state) => {
    expect(isStaffReplyAllowed(state)).toBe(true);
    expect(() => requireStaffReplyAllowed(makeThread({ state }))).not.toThrow();
  });

  it.each(prohibitedStates)("rejects staff reply in %s", (state) => {
    expect(isStaffReplyAllowed(state)).toBe(false);
    expect(() => requireStaffReplyAllowed(makeThread({ state }))).toThrowError(
      expect.objectContaining({ code: "REPLY_NOT_ALLOWED" }),
    );
  });
});
