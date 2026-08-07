"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { readSpeakAnswers, writeSpeakAnswers } from "@/lib/voice/preference";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { humanizeChatError } from "./chat-error";
import { useSpeechAvailable } from "./use-speech-available";
import { useSpokenAnswer } from "./use-spoken-answer";
import { useMicrophone } from "./use-microphone";
import { useTranscribeAvailable } from "./use-transcribe-available";
import type { PersistedMessage } from "./types";

const CREATE_FAILED = "Could not start a new conversation. Please try again.";

export function ChatView({
  initialConversationId,
  onStarted,
  onTurnComplete,
  focusSignal,
}: {
  initialConversationId: string | null;
  onStarted?: (id: string) => void;
  onTurnComplete?: () => void;
  // Passed straight through to the composer: "New chat" bumps it to put the cursor
  // in the box. Nothing here reads it.
  focusSignal?: number;
}) {
  // A ref, not state: loadHistory is a useCallback the mount effect depends on, so
  // making the id stateful would re-run that effect the moment a conversation is
  // created mid-submit — clearing the messages of the answer streaming into it.
  const conversationRef = useRef<string | null>(initialConversationId);
  // The lock for submit()'s creation branch. It must be a ref, not just the
  // `starting` state below: a second submit can land in the same tick as the
  // first, before React has re-rendered the (now-disabled) Send button, and a
  // state update is not visible to that second call — only a ref, read and
  // written synchronously, is.
  const creating = useRef(false);
  // Re-render-only companion to `creating`: what makes the Send button (and any
  // other affordance) reflect that creation is underway.
  const [starting, setStarting] = useState(false);
  const [persisted, setPersisted] = useState<PersistedMessage[]>([]);
  // Failures that happen before useChat is ever involved, and which its own `error`
  // therefore cannot report: creating the conversation the first message needs.
  const [startError, setStartError] = useState<string | null>(null);
  const { messages, input, handleInputChange, handleSubmit, status, setMessages, setInput, error, append } = useChat({
    api: "/api/chat",
  });
  const prevStatus = useRef(status);

  const speechAvailable = useSpeechAvailable();
  const transcribeAvailable = useTranscribeAvailable();
  const busy = status === "submitted" || status === "streaming" || starting;
  const mic = useMicrophone({
    onTranscript: (text) => void submitVoice(text),
    disabled: busy,
  });
  // useMicrophone's `supported` is computed during render (browserRecorder() runs
  // inside a useState lazy initialiser), so it is null/false on the server and on
  // the client's own first (hydration) render, then a real Recorder from the next
  // client render on — a hydration mismatch on its own, same shape as the one
  // use-speech-available.ts defers to an effect. The microphone is safe only
  // because transcribeAvailable is *also* seeded false on that first client
  // render, so ANDing it in keeps the first client render's markup matching the
  // server's. Do not drop this gate to "simplify" it away.
  const micReady = mic.supported && transcribeAvailable;
  // Seeded false and read in an effect, never during render: the server cannot know
  // what this device stored, and disagreeing with it is a hydration mismatch.
  const [speakAnswers, setSpeakAnswers] = useState(false);
  useEffect(() => setSpeakAnswers(readSpeakAnswers()), []);
  // Whether a turn has actually been sent since this component mounted — distinct
  // from whether the conversation already has messages. useSpokenAnswer's off->on
  // logic adopts whatever answer is currently showing as "already spoken" the first
  // time it becomes enabled; at mount, before loadHistory resolves, that answer is
  // empty, and it is *replaced* by the loaded one moments later without `enabled`
  // ever toggling again. Left ungated, opening an old conversation with the switch
  // already on reads its last answer aloud, unprompted. Gating on a real turn having
  // started in this session — set in both submit() and submitVoice(), and never
  // unset — closes that without touching the adopt-on-toggle behavior mid-turn.
  const [hasLiveTurn, setHasLiveTurn] = useState(false);

  function toggleSpeakAnswers() {
    const next = !speakAnswers;
    writeSpeakAnswers(next);
    setSpeakAnswers(next);
  }

  // Bumped at the start of every loadHistory() call. A monotonic counter, not a
  // boolean "is this the latest call" flag: a flag is only good for telling the
  // second of two calls apart from the first, and is defeated the moment a THIRD
  // call supersedes the second before the second's own response lands — the
  // second would then see the flag still saying "I'm latest" and write anyway.
  // recorder.ts's `generation` counter documents the identical reasoning for
  // start() superseding start().
  const loadHistorySeq = useRef(0);

  const loadHistory = useCallback(async () => {
    const id = conversationRef.current;
    if (!id) return;
    const mySeq = ++loadHistorySeq.current;
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const msgs: PersistedMessage[] = data.messages ?? [];
    // The ready-triggered and error-triggered refetches (below) both call
    // loadHistory independently, so a slow first response can resolve AFTER a
    // faster later one — e.g. the error path's GET is still in flight when a
    // fast retry succeeds and the ready path's GET both fires and resolves
    // first. Without this guard the stale response's setMessages would land
    // last and clobber the fresh state already on screen.
    if (mySeq !== loadHistorySeq.current) return;
    setPersisted(msgs);
    setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
  }, [setMessages]);

  // Load an existing conversation once. ChatPage remounts this component when the
  // user picks a different one, so there is no second load to schedule here.
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // A streamed turn finishing (status back to "ready") is when images, ratings and
  // the source count exist in the database, so that is when history is refetched.
  // A turn that FAILED refetches too: ai-sdk parks status at "error", and without a
  // resync the local messages keep a partial assistant entry the database never got.
  // The count of assistant turns then drives turnKey (see below), so the next
  // successful turn's refetch would shrink the list, move turnKey backwards, and make
  // useSpokenAnswer re-read the whole answer aloud. onTurnComplete stays on the ready
  // path alone — a failed turn did not complete.
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") {
      void loadHistory().then(() => onTurnComplete?.());
    } else if (prevStatus.current !== "error" && status === "error") {
      void loadHistory();
    }
    prevStatus.current = status;
  }, [status, loadHistory, onTurnComplete]);

  // The creation branch, shared by both send paths. Null means the caller must
  // not send: either creation failed, or another submit is already creating one
  // and this call is ignored outright rather than queued — it can neither send
  // into a conversation that does not exist yet nor create a duplicate.
  async function ensureConversation(): Promise<string | null> {
    // A new attempt is under way, so the last one's message no longer describes
    // anything. useChat clears its own `error` the same way, inside triggerRequest.
    // mic.error is cleared here too, not just on the next recording: a typed
    // send following a refused mic permission must not leave that refusal
    // pinned in the one error slot the two sources share.
    setStartError(null);
    mic.clearError();
    const existing = conversationRef.current;
    if (existing) return existing;
    if (creating.current) return null;
    creating.current = true;
    setStarting(true);
    try {
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) {
        setStartError(CREATE_FAILED);
        return null;
      }
      const id = (await res.json()).id as string;
      conversationRef.current = id;
      onStarted?.(id);
      return id;
    } catch {
      // A dropped connection rejects the fetch. Caught here because the failure
      // has to reach the transcript like any other, and because the callers are
      // event handlers that cannot await this.
      setStartError(CREATE_FAILED);
      return null;
    } finally {
      creating.current = false;
      setStarting(false);
    }
  }

  async function submit() {
    const id = await ensureConversation();
    if (!id) return;
    handleSubmit(undefined, { body: { conversationId: id } });
    setHasLiveTurn(true);
  }

  // Voice cannot go through handleSubmit: it reads `input` from state, which is
  // still stale in the tick a transcript arrives. append() takes the text directly.
  async function submitVoice(text: string) {
    // A turn is already in flight. The typed path is gated by the composer's
    // `canSend = value.trim().length > 0 && !busy`; this one had no equivalent,
    // so a transcript arriving mid-stream started a SECOND concurrent
    // /api/chat request — and with ai@^4 the second overwrites the first's
    // abortControllerRef while both write into the same message list.
    //
    // Reaching this state is ordinary, not exotic: a manual stop is deliberately
    // left pressable while busy (a live microphone must always be stoppable), and
    // toggle() in "recording" calls finish(), which transcribes and sends. The
    // VAD's silence stop and the 60-second cap do the same on their own. So
    // refusing outright would mean there is no way to end a recording started
    // before the turn without throwing away what was said.
    //
    // The spec's settled "send immediately, do not drop it into the input for
    // review" decision was made about the idle case — the case where sending is
    // possible. Here it is not, so the transcript goes to the composer, in front
    // of the user, ready to send the moment the turn finishes. Whatever was
    // already typed is kept rather than overwritten: the box is not disabled
    // while busy (composer.tsx only disables Send), so there may well be some.
    if (busy) {
      setInput((prev) => (prev.trim() === "" ? text : `${prev.trimEnd()} ${text}`));
      return;
    }
    const id = await ensureConversation();
    if (!id) return;
    void append({ role: "user", content: text }, { body: { conversationId: id } });
    // Must be set here too, or a spoken question's answer is never read aloud —
    // the two halves of this feature meet exactly at this line.
    setHasLiveTurn(true);
  }

  // One error slot for the transcript, fed by all three sources: a conversation
  // that could not be created, a turn that failed once a conversation exists, and
  // the microphone itself. mic.error sits LAST, not first: it is only cleared on
  // the next successful send attempt (see ensureConversation), so a stale refusal
  // from minutes ago must never outrank — and hide — a live chat error.
  const shownError = startError ?? (error ? humanizeChatError(error) : undefined) ?? mic.error ?? undefined;
  const persistedById = new Map(persisted.map((m) => [m.id, m]));
  const stream = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }));

  const lastAssistant = [...stream].reverse().find((m) => m.role === "assistant");
  // Not lastAssistant?.id: finishing a turn triggers loadHistory above, which
  // replaces every message's ai-sdk id with the database's — an identity change
  // useSpokenAnswer would otherwise read as a new turn, cancelling an answer that is
  // still being read aloud (synthesis is far slower than the refetch). The assistant
  // turn count is stable across that swap (same position, same count either side of
  // it) and still advances the moment ai-sdk appends a genuinely new one.
  const assistantTurns = stream.filter((m) => m.role === "assistant").length;
  useSpokenAnswer({
    answer: lastAssistant?.content ?? "",
    status,
    // `mic.state === "idle"` is the seam between the two halves of this feature.
    // Speech synthesis is far slower than the stream (see the comment above), so
    // a turn finishing flips `busy` false and re-enables the microphone while the
    // assistant is still reading the answer OUT LOUD. A hands-free user presses
    // the microphone right then; the AnalyserNode measures whatever the mic
    // hears, the energy gate passes on the assistant's own voice, and the answer
    // comes back from the transcription provider as the user's next question.
    // Routing through `enabled` reuses the !enabled effect's own cancel().
    //
    // Idle rather than !== "recording": from the moment the button is pressed the
    // user has said they want to talk, and "requesting" can sit on an open
    // permission prompt for seconds. Re-enabling afterwards does not replay
    // anything — the disable effect resets wasEnabled, so the next enabled pass
    // adopts the answer as it then stands.
    enabled: speakAnswers && speechAvailable && hasLiveTurn && mic.state === "idle",
    turnKey: String(assistantTurns),
  });

  return (
    <>
      {stream.length === 0 && status === "ready" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto px-4">
          <EmptyState
            title="Ask your documents a question"
            description="Type below. Answers cite how many passages they stand on."
          />
          {/* Beside the panel, not instead of it. This branch used to be gated on
              `!shownError`, so a user whose very first action was a silent
              recording (or a refused mic permission) lost the only thing on
              screen telling them what to do, and saw an error in its place. */}
          {shownError && <Alert tone="danger">{shownError}</Alert>}
        </div>
      ) : (
        <MessageList
          messages={stream}
          persistedById={persistedById}
          pending={status === "submitted"}
          error={shownError}
        />
      )}
      <Composer
        value={input}
        onChange={handleInputChange}
        onSubmit={() => void submit()}
        focusSignal={focusSignal}
        // Only the two in-flight states, never "error": useChat parks status at
        // "error" until the *next* request starts, so treating anything that is not
        // "ready" as busy left Send disabled forever after one failed turn. Retrying
        // from here is safe — triggerRequest clears the error and moves to
        // "submitted" itself.
        busy={busy}
        speakAnswers={speakAnswers}
        onToggleSpeakAnswers={speechAvailable ? toggleSpeakAnswers : undefined}
        onMicrophone={micReady ? mic.toggle : undefined}
        micState={mic.state}
        micElapsedMs={mic.elapsedMs}
      />
    </>
  );
}
