// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

  it("does not create a second conversation when two submits race the same creation request", async () => {
    chatState.input = "why?";
    const onStarted = vi.fn();
    // A gate the test controls, not a canned response: every call to
    // /api/conversations awaits it and only then builds its own Response, so two
    // concurrent POSTs stay concurrent (and each other's fresh Response, not a
    // shared one whose body can only be read once) until the test releases them.
    let releaseCreate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const fetchSpy = stubFetch(async (url) => {
      if (url === "/api/conversations") {
        await gate;
        return new Response(JSON.stringify({ id: "new-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });

    render(<ChatView initialConversationId={null} onStarted={onStarted} />);
    const sendButton = screen.getByRole("button", { name: "Send" });

    // Both clicks land while the first creation POST is still pending — the exact
    // window in which only a synchronously-read-and-written ref, not a state flag
    // that re-renders asynchronously, can stop a second conversation from being born.
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    releaseCreate();

    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls.filter(([url]) => url === "/api/conversations")).toHaveLength(1);
  });

  it("disables Send while the creation request is in flight", async () => {
    chatState.input = "why?";
    let releaseCreate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    stubFetch(async (url) => {
      if (url === "/api/conversations") {
        await gate;
        return new Response(JSON.stringify({ id: "new-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });

    render(<ChatView initialConversationId={null} />);
    const sendButton = screen.getByRole("button", { name: "Send" });
    fireEvent.click(sendButton);

    await waitFor(() => expect(sendButton).toBeDisabled());
    releaseCreate();
    // Let the finally block's setStarting(false) settle inside act() rather than
    // leaving it to fire after the test has already moved on.
    await waitFor(() => expect(sendButton).not.toBeDisabled());
  });

  it("lets the user retry after a failed turn", async () => {
    // @ai-sdk/react 1.2.12 parks `status` at "error" after a failed request and only
    // leaves it when the next request starts (triggerRequest sets "submitted" and
    // clears `error` itself). Gating the composer on `status !== "ready"` therefore
    // disabled Send for good: the user read "try again" and could not.
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    chatState.input = "why?";
    chatState.status = "error";
    chatState.error = new Error(
      JSON.stringify({ error: "You have reached the message limit. Try again in 42 seconds." }),
    );

    render(<ChatView initialConversationId="c1" />);
    const send = await screen.findByRole("button", { name: "Send" });
    expect(send).not.toBeDisabled();

    await userEvent.click(send);
    await waitFor(() =>
      expect(handleSubmitMock).toHaveBeenCalledWith(undefined, { body: { conversationId: "c1" } }),
    );
  });

  it("passes a raised focus signal through to the composer", async () => {
    // The seam between ChatPage's "New chat" and the box the user types in.
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    const { rerender } = render(<ChatView initialConversationId="c1" focusSignal={0} />);
    const box = await screen.findByLabelText("Message");
    expect(box).not.toHaveFocus();

    rerender(<ChatView initialConversationId="c1" focusSignal={1} />);

    expect(box).toHaveFocus();
  });

  it("invites the first question when there is nothing to show", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    render(<ChatView initialConversationId={null} />);
    expect(await screen.findByText("Ask your documents a question")).toBeInTheDocument();
    // The composer is present with no conversation selected — that is the point.
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });
});
