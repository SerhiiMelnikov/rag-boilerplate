// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatView } from "./chat-view";

// The component's only source of an error is useChat's `error`. Mock the hook so
// the test drives that field directly instead of faking a whole HTTP failure.
const chatState: { error?: Error } = {};
// setMessages must be referentially stable across renders, like the real hook's
// setter: chat-view's loadHistory (a useCallback) depends on it, and the mount
// effect depends on loadHistory. A fresh vi.fn() on every call would give
// loadHistory a new identity every render, retriggering the mount effect and
// spinning forever (observed: OOM-crashes the test worker).
const setMessagesMock = vi.fn();
const handleInputChangeMock = vi.fn();
const handleSubmitMock = vi.fn();
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    input: "",
    handleInputChange: handleInputChangeMock,
    handleSubmit: handleSubmitMock,
    status: "ready",
    setMessages: setMessagesMock,
    error: chatState.error,
  }),
}));

beforeEach(() => {
  chatState.error = undefined;
  // loadHistory() runs on mount; give it an empty conversation.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatView error banner", () => {
  it("shows the server's message when the request is rejected", async () => {
    // A 429 from the chat route reaches useChat as a thrown Error whose message
    // is the raw response body.
    chatState.error = new Error(
      JSON.stringify({ error: "You have reached the message limit. Try again in 42 seconds." }),
    );
    render(<ChatView conversationId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have reached the message limit. Try again in 42 seconds.",
    );
  });

  it("shows no alert when nothing failed", () => {
    render(<ChatView conversationId="c1" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
