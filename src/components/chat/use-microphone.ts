"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stepVad, INITIAL_VAD_STATE, VAD_DEFAULTS, type VadState } from "@/lib/voice/silence";
import { browserRecorder, type Recorder, type RecordedAudio } from "./recorder";

export type MicState = "idle" | "requesting" | "recording" | "transcribing";

const FRAME_MS = 50;

const MIC_REFUSED = "Microphone access was refused.";
const RATE_LIMITED = "You have reached the voice limit. Try again shortly.";
const NOT_CONFIGURED = "Voice input is not configured.";
const TOO_LONG = "That recording is too long.";
const GENERIC = "Could not transcribe that. Try again.";
const NO_SPEECH = "No speech detected — nothing was sent.";

// Thrown by the default transcribe call so the hook can map a status to a
// message without knowing anything about fetch.
class TranscribeError extends Error {
  constructor(public status: number) {
    super(`transcribe failed with ${status}`);
    this.name = "TranscribeError";
  }
}

async function postAudio(audio: RecordedAudio): Promise<string> {
  const form = new FormData();
  // The server reads file.type, not the name — the Blob carries the mime type
  // MediaRecorder chose, codec parameter and all.
  form.append("audio", audio.blob, "recording");
  const res = await fetch("/api/chat/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new TranscribeError(res.status);
  const data = await res.json();
  return typeof data.text === "string" ? data.text.trim() : "";
}

function messageFor(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as Error).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return MIC_REFUSED;
  const status = err && typeof err === "object" && "status" in err ? Number((err as { status: unknown }).status) : 0;
  if (status === 429) return RATE_LIMITED;
  if (status === 503) return NOT_CONFIGURED;
  if (status === 413) return TOO_LONG;
  return GENERIC;
}

// Owns every rule about when recording starts and stops.
//
// `recorder` must be referentially stable across renders — the default is built
// once via useState's lazy initialiser, and a caller supplying its own must
// memoise it, or the unmount cleanup below fires on every render.
export function useMicrophone({
  onTranscript,
  recorder,
  transcribeFn = postAudio,
  disabled,
}: {
  /** Called with a non-empty, trimmed transcript. Never called with "". */
  onTranscript: (text: string) => void;
  /** Injected for tests; defaults to browserRecorder(). */
  recorder?: Recorder | null;
  /** Injected for tests; defaults to POSTing to /api/chat/transcribe. */
  transcribeFn?: (audio: RecordedAudio) => Promise<string>;
  /** True while a turn is in flight. A press is ignored. */
  disabled: boolean;
}): {
  state: MicState;
  elapsedMs: number;
  error: string | null;
  supported: boolean;
  toggle: () => void;
  /** Clears a stale error left over from a previous press. Never cleared on its
   * own by the passage of time or a new render — a caller that starts a turn
   * through some path other than the mic (e.g. sending a typed message) must
   * call this itself, or a refused-permission message from minutes ago keeps
   * occupying the one error slot the rest of the chat shares. */
  clearError: () => void;
} {
  const [fallback] = useState<Recorder | null>(() => (recorder === undefined ? browserRecorder() : null));
  const active = recorder !== undefined ? recorder : fallback;

  const [state, setState] = useState<MicState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const vad = useRef<VadState>(INITIAL_VAD_STATE);
  // The auto-stop and a manual press can land in the same tick. A ref, read and
  // written synchronously, is the only thing a second call can see — a state
  // update is not yet visible to it.
  const finishing = useRef(false);
  // Read inside the frame callback, which closes over the render it was created
  // in; a ref is what lets that callback see the current handler.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const transcribeRef = useRef(transcribeFn);
  transcribeRef.current = transcribeFn;

  // active.cancel() is insurance: defence in depth against a recorder that
  // failed to clean up after itself. Insurance must not be able to cost more
  // than it insures. Called bare, a throwing cancel() escaped the async IIFE in
  // toggle() as an unhandled rejection, swallowed the user-facing message that
  // was meant to follow it, and stranded state at "requesting" — permanently
  // unusable, strictly worse than the leak it was guarding against. Every call
  // goes through here, and every one is placed AFTER the setError/setState it
  // must not be able to prevent.
  const cancelQuietly = useCallback(() => {
    try {
      active?.cancel();
    } catch {
      // A recorder that cannot even release its own stream is not something the
      // user can act on, and there is no second thing to try.
    }
  }, [active]);

  const finish = useCallback(async () => {
    if (!active || finishing.current) return;
    finishing.current = true;
    setState("transcribing");
    try {
      const audio = await active.stop();
      // Silence recorded by accident must not spend a model request. This has
      // to happen HERE rather than on the result: handed a silent clip, Gemini
      // echoes the instruction it was given and Whisper hallucinates a stock
      // phrase, so what comes back is confidently wrong rather than empty and
      // no check on the returned string can tell it from a real transcript.
      // vad.current is reset per recording in toggle()'s start branch.
      if (vad.current.spokeMs < VAD_DEFAULTS.minSpeechMs) {
        setError(NO_SPEECH);
        return;
      }
      const text = await transcribeRef.current(audio);
      // A transcript can come back empty for the same reason the gate above
      // exists — the recording held no speech, and the server's own guards
      // caught what the energy floor let through. Saying so is the difference
      // between "nothing was heard" and "the button is broken".
      if (text === "") {
        setError(NO_SPEECH);
        return;
      }
      onTranscriptRef.current(text);
    } catch (err) {
      // active.stop() can reject without having released anything (the device
      // went away, or the recorder was already inactive). Without cancelling
      // here, the frame loop survives and every subsequent silent frame trips
      // the VAD's "silence" stop again, calling finish() again forever.
      setError(messageFor(err));
      cancelQuietly();
    } finally {
      finishing.current = false;
      setState("idle");
      setElapsedMs(0);
    }
  }, [active, cancelQuietly]);

  const toggle = useCallback(() => {
    if (!active) return;
    // A manual stop must always be reachable, disabled or not: the VAD auto-stop
    // (above) calls finish() directly and is never blocked by `disabled`, so a
    // press that starts a turn while recording must be just as unblocked —
    // otherwise submitting a typed message strands a live microphone with no
    // way for the user to end it.
    if (state === "recording") { void finish(); return; }
    if (disabled || state !== "idle") return;

    setError(null);
    setState("requesting");
    vad.current = INITIAL_VAD_STATE;
    setElapsedMs(0);
    void (async () => {
      try {
        await active.start((energy) => {
          const out = stepVad(vad.current, energy, FRAME_MS);
          vad.current = out.state;
          setElapsedMs(out.state.elapsedMs);
          if (out.stop) void finish();
        }, FRAME_MS);
        setState("recording");
      } catch (err) {
        // start() can throw after it has already acquired something (a stream,
        // an already-started MediaRecorder) — see recorder.ts's own rollback.
        // cancel() is documented safe when idle, so this costs nothing on the
        // plain permission-refused path where nothing was acquired at all; it
        // is the defence in depth that holds even if a future recorder
        // implementation forgets its own cleanup.
        setError(messageFor(err));
        setState("idle");
        cancelQuietly();
      }
    })();
  }, [active, disabled, state, finish, cancelQuietly]);

  // Leaving the page must not leave a microphone recording.
  useEffect(() => () => cancelQuietly(), [cancelQuietly]);

  const clearError = useCallback(() => setError(null), []);

  return { state, elapsedMs, error, supported: active !== null, toggle, clearError };
}
