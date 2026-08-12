import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_BODY_LENGTH,
  createPlainTextMessageBody,
} from "../../src/domain/message.js";

describe("message body", () => {
  it("accepts bounded plain text and normalizes line endings", () => {
    expect(createPlainTextMessageBody("Synthetic line one.\r\nLine two.")).toEqual(
      {
        kind: "PLAIN_TEXT",
        text: "Synthetic line one.\nLine two.",
      },
    );
  });

  it("rejects empty or whitespace-only message bodies", () => {
    expect(() => createPlainTextMessageBody(" \n\t ")).toThrowError(
      expect.objectContaining({ code: "INVALID_MESSAGE_BODY" }),
    );
  });

  it("rejects message bodies beyond the prototype bound", () => {
    expect(() =>
      createPlainTextMessageBody("x".repeat(MAX_MESSAGE_BODY_LENGTH + 1)),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE_BODY" }));
  });

  it("rejects disallowed control characters", () => {
    expect(() => createPlainTextMessageBody("Synthetic\u0000body")).toThrowError(
      expect.objectContaining({ code: "INVALID_MESSAGE_BODY" }),
    );
  });
});
