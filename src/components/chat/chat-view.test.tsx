// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView } from "./chat-view";

type MockMessage = { id: string; role: string; content: string };
const chatState: { error?: Error; status: string; input: string; messages: MockMessage[] } = {
  status: "ready",
  input: "",
  messages: [],
};
// setMessages must be referentially stable across renders, like the real hook's
// setter: loadHistory (a useCallback) depends on it, and the mount effect depends on
// loadHistory. A fresh vi.fn() per call would re-trigger the mount effect forever.
// Given a real implementation, not left a no-op: the history-refetch tests below need
// loadHistory's own setMessages call to actually change what the next render's
// useChat() returns, the same way the real hook's setter does.
const setMessagesMock = vi.fn((msgs: MockMessage[]) => {
  chatState.messages = msgs;
});
const handleInputChangeMock = vi.fn();
const handleSubmitMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chatState.messages,
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
  chatState.messages = [];
  handleSubmitMock.mockClear();
  setMessagesMock.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // The speak-answers toggle writes to the real jsdom localStorage (it is not
  // mocked); left dirty, a test appended after one that turns the toggle on would
  // start with it already on.
  window.localStorage.clear();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

// jsdom implements neither speechSynthesis nor the utterance constructor
// speech-engine.ts builds from it, so any test that reaches a real speak() call —
// not just a rendered toggle — needs both stubbed.
function stubSpeechSynthesis(overrides: { speak?: ReturnType<typeof vi.fn>; cancel?: ReturnType<typeof vi.fn> } = {}) {
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [{ name: "Alex" }],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    speak: overrides.speak ?? vi.fn(),
    cancel: overrides.cancel ?? vi.fn(),
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      constructor(public text: string) {}
    },
  );
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

  it("says so when the conversation could not be created", async () => {
    // Before: `if (!res.ok) return;` — the user pressed Send on their first message
    // and absolutely nothing happened, on screen or in the transcript's error slot.
    chatState.input = "why?";
    stubFetch(async (url) =>
      url === "/api/conversations"
        ? new Response(JSON.stringify({ error: "nope" }), { status: 500 })
        : new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );

    render(<ChatView initialConversationId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start a new conversation.");
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it("says so when the creation request throws", async () => {
    // A dropped connection rejects the fetch. Unhandled, that was an unhandled
    // rejection and a silent failure at the same time.
    chatState.input = "why?";
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    render(<ChatView initialConversationId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start a new conversation.");
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it("clears a creation failure when the next attempt starts", async () => {
    chatState.input = "why?";
    let failCreate = true;
    stubFetch(async (url) => {
      if (url === "/api/conversations") {
        return failCreate
          ? new Response(JSON.stringify({ error: "nope" }), { status: 500 })
          : new Response(JSON.stringify({ id: "new-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });

    render(<ChatView initialConversationId={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    failCreate = false;
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(handleSubmitMock).toHaveBeenCalledWith(undefined, { body: { conversationId: "new-1" } }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("does not offer the toggle when the browser has no voices", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    render(<ChatView initialConversationId="c1" />); // jsdom has no speechSynthesis
    // waitFor, not a synchronous assertion: the mount effect's history fetch now
    // resolves (stubFetch above), and its setPersisted/setMessages state update
    // would otherwise land outside any act() boundary once the test has returned.
    await waitFor(() => expect(screen.queryByRole("button", { name: /speak answers/i })).toBeNull());
  });

  it("remembers the choice across a remount", async () => {
    stubFetch(async () => new Response(JSON.stringify({ messages: [] }), { status: 200 }));
    stubSpeechSynthesis();
    const { unmount } = render(<ChatView initialConversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: /speak answers aloud/i }));
    unmount();
    render(<ChatView initialConversationId="c1" />);
    expect(await screen.findByRole("button", { name: /stop speaking answers/i })).toBeInTheDocument();
  });

  it("does not read a conversation's last answer aloud just from opening it", async () => {
    // The toggle was already on (a previous session, or another tab) and the
    // conversation already has an answer sitting in the database. Opening it must
    // not read that answer aloud — only a turn actually sent in *this* session may.
    window.localStorage.setItem("speak_answers", "1");
    const speak = vi.fn();
    stubSpeechSynthesis({ speak });
    const persistedAnswer: MockMessage = {
      id: "db-1",
      role: "assistant",
      content: "Paris is the capital of France.",
    };
    stubFetch(async (url) =>
      url === "/api/conversations/c1"
        ? new Response(JSON.stringify({ messages: [persistedAnswer] }), { status: 200 })
        : new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );

    render(<ChatView initialConversationId="c1" />);
    // Confirms the toggle rendered "on" (localStorage was read) and that the history
    // load actually landed before asserting nothing was spoken because of it.
    await screen.findByRole("button", { name: /stop speaking answers/i });
    await waitFor(() => expect(setMessagesMock).toHaveBeenCalledWith([persistedAnswer]));

    expect(speak).not.toHaveBeenCalled();
  });

  it("keeps speaking through the history refetch that swaps a turn's live id for its database id", async () => {
    // chat-view.tsx keys useSpokenAnswer's turnKey on the assistant-message count,
    // not on the last assistant message's id, precisely because of what this test
    // drives through: loadHistory (fired once a turn's status reaches "ready")
    // replaces every message's ai-sdk id with the database's. An id-keyed turnKey
    // reads that swap as a new turn and cancels an answer that is still being read
    // aloud — synthesis is far slower than the refetch that triggers it.
    chatState.input = "where is the Eiffel Tower?";
    const speak = vi.fn();
    const cancel = vi.fn();
    stubSpeechSynthesis({ speak, cancel });
    const liveMessages: MockMessage[] = [
      { id: "user-1", role: "user", content: "where is the Eiffel Tower?" },
      { id: "live-1", role: "assistant", content: "Paris is the capital of France." },
    ];
    const persistedMessages: MockMessage[] = [
      { id: "db-user-1", role: "user", content: "where is the Eiffel Tower?" },
      { id: "db-1", role: "assistant", content: "Paris is the capital of France." },
    ];
    let historyCalls = 0;
    stubFetch(async (url) => {
      if (url === "/api/conversations/c1") {
        historyCalls += 1;
        return new Response(JSON.stringify({ messages: historyCalls === 1 ? [] : persistedMessages }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    });

    const { rerender } = render(<ChatView initialConversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: /speak answers aloud/i }));
    await waitFor(() => expect(historyCalls).toBe(1)); // the mount load settles first

    // A live turn: the question is sent, then the answer streams in under ai-sdk's
    // own (never-persisted) id.
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    chatState.status = "streaming";
    chatState.messages = liveMessages;
    rerender(<ChatView initialConversationId="c1" />);
    await waitFor(() => expect(speak).toHaveBeenCalled());
    // Both calls so far are legitimate (the toggle turning on, the turn actually
    // starting) — clear them so what's asserted below is only what happens because
    // of the id swap itself, not noise from getting to that point.
    speak.mockClear();
    cancel.mockClear();

    // The turn finishes; ChatView's own effect refetches history, which swaps the
    // live id for the database's.
    chatState.status = "ready";
    rerender(<ChatView initialConversationId="c1" />);
    await waitFor(() => expect(setMessagesMock).toHaveBeenCalledWith(persistedMessages));

    // The id swap must not look like a new turn: nothing gets cancelled, and the
    // already-spoken answer is not replayed.
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
  });
});
