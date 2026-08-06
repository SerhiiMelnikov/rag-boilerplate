// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView } from "./chat-view";
import type { Recorder, RecordedAudio } from "./recorder";

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
const appendMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chatState.messages,
    input: chatState.input,
    handleInputChange: handleInputChangeMock,
    handleSubmit: handleSubmitMock,
    status: chatState.status,
    setMessages: setMessagesMock,
    error: chatState.error,
    append: appendMock,
  }),
}));

// The voice tests below need the microphone to actually render, which takes two
// more mocks: useTranscribeAvailable must report the server as ready, and
// ./recorder's browserRecorder (what useMicrophone's own fallback calls when no
// recorder is injected) must hand back something that behaves like one. Bindings
// referenced from a vi.mock() factory have to go through vi.hoisted, since the
// mock calls themselves are hoisted above every other top-level declaration.
const { fakeRecorderApi } = vi.hoisted(() => {
  const AUDIO: RecordedAudio = { blob: new Blob(["audio"], { type: "audio/webm" }), mimeType: "audio/webm;codecs=opus" };
  return {
    fakeRecorderApi: {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => AUDIO),
      cancel: vi.fn(),
    },
  };
});

vi.mock("./use-transcribe-available", () => ({ useTranscribeAvailable: () => true }));
vi.mock("./recorder", () => ({ browserRecorder: () => fakeRecorderApi as unknown as Recorder }));

beforeEach(() => {
  chatState.error = undefined;
  chatState.status = "ready";
  chatState.input = "";
  chatState.messages = [];
  handleSubmitMock.mockClear();
  setMessagesMock.mockClear();
  appendMock.mockClear();
  fakeRecorderApi.start.mockClear();
  fakeRecorderApi.stop.mockClear();
  fakeRecorderApi.cancel.mockClear();
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

// --- Harness for the microphone-wiring tests below --------------------------
//
// None of mountWithVoice/transcriptArrives/typeAndSend/createCalls pre-existed in
// this file; the brief named them as placeholders for "whatever this file already
// has", but there was no render helper here at all (every test above calls
// `render(<ChatView ... />)` directly). These are new, built on the same
// chatState/stubFetch/appendMock/handleSubmitMock mocks the rest of the file uses,
// and on the rerender-after-mutating-chatState idiom the history-refetch tests
// above already establish.

// Set by transcriptArrives before the recorder "hears" anything; read by the
// stubbed POST to /api/chat/transcribe that mountWithVoice installs.
let nextTranscript = "";
// The `rerender` of whichever tree mountWithVoice most recently rendered — what
// lets transcriptArrives/typeAndSend force ChatView to notice a chatState mutation
// made from outside React, exactly like the existing history-refetch tests do.
let rerenderChatView: (() => void) | null = null;

function mountWithVoice() {
  let createCalls = 0;
  stubFetch(async (url, init) => {
    if (url === "/api/conversations" && init?.method === "POST") {
      createCalls += 1;
      return new Response(JSON.stringify({ id: `voice-${createCalls}` }), { status: 201 });
    }
    if (url === "/api/chat/transcribe") {
      return new Response(JSON.stringify({ text: nextTranscript }), { status: 200 });
    }
    return new Response(JSON.stringify({ messages: [] }), { status: 200 });
  });
  const { rerender } = render(<ChatView initialConversationId={null} />);
  rerenderChatView = () => rerender(<ChatView initialConversationId={null} />);
  return {
    append: appendMock,
    handleSubmit: handleSubmitMock,
    createCalls: () => createCalls,
  };
}

// Presses the mic, lets useMicrophone's own start() settle into "recording", then
// presses it again to stop — driving a transcript through the real hook exactly as
// a user would, down to the fetch to /api/chat/transcribe. Waits for append() to
// have actually landed before returning, so a caller that immediately does
// something else (typeAndSend, an assertion on createCalls) is not racing
// submitVoice's still-pending ensureConversation().
async function transcriptArrives(text: string) {
  nextTranscript = text;
  const before = appendMock.mock.calls.length;
  fireEvent.click(screen.getByLabelText("Ask by voice"));
  await waitFor(() => expect(screen.getByLabelText("Stop recording")).toBeTruthy());
  fireEvent.click(screen.getByLabelText("Stop recording"));
  await waitFor(() => expect(appendMock.mock.calls.length).toBeGreaterThan(before));
}

// A typed send. chatState.input is not wired to any real state (handleInputChange
// is a bare mock, same as every other test in this file), so the value is set
// directly and ChatView is forced to notice it via the same rerender-after-mutating
// idiom the history-refetch tests above use. submit() is async even when the
// conversation already exists (ensureConversation is an async function, so even
// its synchronous `return existing` path resolves on a microtask tick), so this
// waits for handleSubmit rather than asserting immediately after the click.
async function typeAndSend(text: string) {
  const before = handleSubmitMock.mock.calls.length;
  chatState.input = text;
  rerenderChatView?.();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(handleSubmitMock.mock.calls.length).toBeGreaterThan(before));
}

// Presses the mic once and makes the underlying recorder's start() reject with a
// permission refusal, exactly what a user declining the browser's mic prompt
// produces. Drives use-microphone.ts's real error-mapping (messageFor), not a
// stubbed one, so this is what actually lands in mic.error.
async function micRefuses() {
  fakeRecorderApi.start.mockImplementationOnce(async () => {
    const err = new Error("refused");
    err.name = "NotAllowedError";
    throw err;
  });
  fireEvent.click(screen.getByLabelText("Ask by voice"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
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
    // own (never-persisted) id. Its only sentence sits at the very end of the
    // arrived text, which sentences.ts now withholds while status is "streaming"
    // (end of arrived text is indistinguishable from a delta boundary) — it is
    // not spoken yet here, only once the turn finishes and flush picks it up below.
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    chatState.status = "streaming";
    chatState.messages = liveMessages;
    rerender(<ChatView initialConversationId="c1" />);

    // Cleared BEFORE the render that both flushes and starts the swap, not after:
    // loadHistory's fetch (and everything it drives, including the buggy turnKey
    // effect this test guards against) can fully resolve within the SAME await
    // that observes the legitimate flush call below — waitFor polls by yielding to
    // the event loop, and the mocked fetch's promise chain needs only a couple of
    // microtask ticks, comfortably inside that window. A clear placed after that
    // await, as this used to be, can erase an illegitimate cancel()/speak() before
    // either assertion below ever sees it — the assertion would then pass whether
    // the swap is handled correctly or not.
    speak.mockClear();
    cancel.mockClear();

    // The turn finishes: status reaches "ready", which both flushes the withheld
    // sentence above (legitimate — the turn is genuinely over) and, separately,
    // fires ChatView's history refetch that swaps the live id for the database's.
    chatState.status = "ready";
    rerender(<ChatView initialConversationId="c1" />);
    // The one call the assertions below allow for: the turn genuinely finishing.
    await waitFor(() => expect(speak).toHaveBeenCalled());

    await waitFor(() => expect(setMessagesMock).toHaveBeenCalledWith(persistedMessages));

    // The id swap must not look like a new turn: nothing gets cancelled, and the
    // already-spoken answer is not replayed as a second call. (Not "not called":
    // the legitimate flush call above is no longer cleared away, so the swap's own
    // effect adding a second, illegitimate call is what this must now catch.)
    expect(cancel).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("sends a voice transcript through append, not handleSubmit", async () => {
    // handleSubmit reads `input` from state, which is stale in the tick a
    // transcript arrives — a transcript sent through it would send an empty
    // message or the previously typed one.
    const { append, handleSubmit } = mountWithVoice();
    await transcriptArrives("how many documents");
    await waitFor(() => expect(append).toHaveBeenCalled());
    expect(append.mock.calls[0][0]).toEqual({ role: "user", content: "how many documents" });
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("creates the conversation once across a voice send and a typed send", async () => {
    const { createCalls } = mountWithVoice();
    await transcriptArrives("first");
    await typeAndSend("second");
    expect(createCalls()).toBe(1);
  });

  it("passes the created conversation id on the voice path", async () => {
    const { append } = mountWithVoice();
    await transcriptArrives("hello");
    await waitFor(() => expect(append).toHaveBeenCalled());
    expect(append.mock.calls[0][1]).toMatchObject({ body: { conversationId: expect.any(String) } });
  });

  it("still sends a typed message through handleSubmit", async () => {
    const { handleSubmit } = mountWithVoice();
    await typeAndSend("typed");
    expect(handleSubmit).toHaveBeenCalled();
  });

  it("reads a voice-sent question's answer aloud when speaking is enabled", async () => {
    // The falsification target for this file: submitVoice's setHasLiveTurn(true).
    // Deleting that one line breaks none of the tests above — nothing else in this
    // file exercises it — which is exactly the gap this test exists to close. It is
    // the seam where the microphone and the spoken-answers feature meet.
    window.localStorage.setItem("speak_answers", "1");
    const speak = vi.fn();
    stubSpeechSynthesis({ speak });

    const { append } = mountWithVoice();
    await transcriptArrives("where is the Eiffel Tower?");
    await waitFor(() => expect(append).toHaveBeenCalled());

    // The turn streams in, exactly as a typed turn's would (mirrors the id-swap
    // test above): a live assistant message arrives while status is "streaming",
    // then the turn finishes.
    chatState.status = "streaming";
    chatState.messages = [
      { id: "user-1", role: "user", content: "where is the Eiffel Tower?" },
      { id: "live-1", role: "assistant", content: "Paris is the capital of France." },
    ];
    rerenderChatView?.();
    chatState.status = "ready";
    rerenderChatView?.();

    await waitFor(() => expect(speak).toHaveBeenCalled());
  });

  it("shows a refused microphone permission in the alert slot", async () => {
    // Fix-round finding: there was no test that mic.error reaches the shared
    // error slot at all, in either ordering.
    mountWithVoice();
    await micRefuses();
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was refused.");
  });

  it("shows a live chat error even when a stale microphone error exists", async () => {
    // mic.error is only cleared by the NEXT send attempt (ensureConversation), not
    // by the passage of time or by a later chat error arriving on its own — so a
    // refused-permission message from minutes ago must never outrank, and hide, a
    // real turn failure that happens afterward.
    mountWithVoice();
    await micRefuses();
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was refused.");

    chatState.error = new Error(
      JSON.stringify({ error: "You have reached the message limit. Try again in 42 seconds." }),
    );
    rerenderChatView?.();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You have reached the message limit. Try again in 42 seconds.",
    );
  });

  it("clears a stale microphone error once a new turn is sent", async () => {
    const { handleSubmit } = mountWithVoice();
    await micRefuses();
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was refused.");

    await typeAndSend("hello");

    expect(handleSubmit).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
