import { describe, it, expect } from "vitest";
import { humanizeChatError } from "./chat-error";

describe("humanizeChatError", () => {
  // The AI SDK throws with the raw response body as the message, so our JSON
  // error body arrives here as a JSON string.
  it("pulls the message out of a JSON error body", () => {
    const err = new Error(JSON.stringify({ error: "You have reached the message limit. Try again in 42 seconds." }));
    expect(humanizeChatError(err)).toBe("You have reached the message limit. Try again in 42 seconds.");
  });

  it("passes a plain-text error through unchanged", () => {
    expect(humanizeChatError(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  // JSON, but not our shape (e.g. a proxy's own error envelope).
  it("falls back to the raw text when the JSON has no error field", () => {
    const raw = JSON.stringify({ statusCode: 502 });
    expect(humanizeChatError(new Error(raw))).toBe(raw);
  });

  it("gives a generic sentence when the error carries no message", () => {
    expect(humanizeChatError(new Error(""))).toBe("Something went wrong. Please try again.");
  });
});
