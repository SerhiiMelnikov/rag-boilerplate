"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stepVad, INITIAL_VAD_STATE, type VadState } from "@/lib/voice/silence";
import { browserRecorder, type Recorder, type RecordedAudio } from "./recorder";

export type MicState = "idle" | "requesting" | "recording" | "transcribing";

const FRAME_MS = 50;

const MIC_REFUSED = "Microphone access was refused.";
const RATE_LIMITED = "You have reached the voice limit. Try again shortly.";
const NOT_CONFIGURED = "Voice input is not configured.";
const TOO_LONG = "That recording is too long.";
const GENERIC = "Could not transcribe that. Try again.";

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

  const finish = useCallback(async () => {
    if (!active || finishing.current) return;
    finishing.current = true;
    setState("transcribing");
    try {
      const audio = await active.stop();
      const text = await transcribeRef.current(audio);
      // An empty transcript is silence recorded by accident. It must not spend
      // a model request, and it must not look like a failure either.
      if (text !== "") onTranscriptRef.current(text);
    } catch (err) {
      // active.stop() can reject without having released anything (the device
      // went away, or the recorder was already inactive). Without cancelling
      // here, the frame loop survives and every subsequent silent frame trips
      // the VAD's "silence" stop again, calling finish() again forever.
      active.cancel();
      setError(messageFor(err));
    } finally {
      finishing.current = false;
      setState("idle");
      setElapsedMs(0);
    }
  }, [active]);

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
        active.cancel();
        setError(messageFor(err));
        setState("idle");
      }
    })();
  }, [active, disabled, state, finish]);

  // Leaving the page must not leave a microphone recording.
  useEffect(() => () => active?.cancel(), [active]);

  return { state, elapsedMs, error, supported: active !== null, toggle };
}
