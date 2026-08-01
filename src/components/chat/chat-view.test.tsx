// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView } from "./chat-view";

const chatState: { error?: Error; status: string; input: string } = { status: "ready", input: "" };
// setMessages must be referentially stable across renders, like the real hook's
// setter: loadHistory (a useCallback) depends on it, and the mount effect depends on
// loadHistory. A fresh vi.fn() per call would re-trigger the mount effect forever.
const setMessagesMock = vi.fn();
const handleInputChangeMock = vi.fn();
const handleSubmitMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    input: chatState.input,
    handleInputChange: handleInputChangeMock,
    handleSubmit: handleSubmitMock,
    status: chatState.status,
    setMessages: setMessagesMock,
    error: chatState.error,
  }),
}));

beforeEach(() => {
  chatState.error = undefined;
  chatState.status = "ready";
  chatState.input = "";
  handleSubmitMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("ChatView", () => {
  it("shows the server's message when the request is rejected", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    chatState.error = new Error(
      JSON.stringify({ error: "You have reached the message limit. Try again in 42 seconds." }),
    );
    render(<ChatView initialConversationId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You have reached the message limit. Try again in 42 seconds.",
    );
  });

  it("shows no alert when nothing failed", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    render(<ChatView initialConversationId="c1" />);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("creates a conversation on the first message and sends to it", async () => {
    chatState.input = "why?";
    const onStarted = vi.fn();
    const fetchSpy = stubFetch(async (url) => {
      if (url === "/api/conversations") {
        return new Response(JSON.stringify({ id: "new-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });

    render(<ChatView initialConversationId={null} onStarted={onStarted} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("new-1"));
    expect(fetchSpy).toHaveBeenCalledWith("/api/conversations", { method: "POST" });
    expect(handleSubmitMock).toHaveBeenCalledWith(undefined, { body: { conversationId: "new-1" } });
  });

  it("does not create a second conversation when one is open", async () => {
    chatState.input = "why?";
    const fetchSpy = stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));

    render(<ChatView initialConversationId="c1" />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(handleSubmitMock).toHaveBeenCalledWith(undefined, { body: { conversationId: "c1" } }),
    );
    expect(fetchSpy).not.toHaveBeenCalledWith("/api/conversations", { method: "POST" });
  });

  it("invites the first question when there is nothing to show", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    render(<ChatView initialConversationId={null} />);
    expect(await screen.findByText("Ask your documents a question")).toBeInTheDocument();
    // The composer is present with no conversation selected — that is the point.
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });
});
