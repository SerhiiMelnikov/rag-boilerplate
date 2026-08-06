"use client";

import { pickMimeType } from "@/lib/voice/mime";

export interface RecordedAudio {
  blob: Blob;
  /**
   * The type that was requested of MediaRecorder, codec parameter included —
   * not MediaRecorder.mimeType. The two agree in practice because the type is
   * negotiated through isTypeSupported first, and this is the one the endpoint's
   * allowlist is checked against.
   */
  mimeType: string;
}

// The seam between the hook and the browser's recording APIs.
//
// It emits a scalar energy per frame rather than an AnalyserNode, and returns a
// Blob rather than a MediaRecorder, for the same reason SpeechEngine takes a
// string instead of an utterance: jsdom implements none of these constructors,
// so a test could not build an argument for the real signature.
export interface Recorder {
  /**
   * Requests the microphone and starts. Rejects if permission is refused.
   *
   * A second call supersedes the first: whatever the first acquired is released
   * before this one asks for anything, and the first call's promise rejects.
   */
  start(onFrame: (energy: number) => void, frameMs: number): Promise<void>;
  /** Stops and resolves with what was captured. */
  stop(): Promise<RecordedAudio>;
  /**
   * Stops, discards, releases the stream. Safe at any time, including idle.
   *
   * "Safe" means the microphone is not live afterwards — NOT merely that this
   * does not throw. In particular it covers a start() that is still awaiting the
   * permission prompt: nothing has been acquired at that moment, so that call is
   * made to release the stream itself when it finally resolves, and to reject.
   */
  cancel(): void;
}

// Null when this browser cannot record anything the endpoint accepts. The
// caller renders no microphone in that case.
export function browserRecorder(): Recorder | null {
  if (typeof window === "undefined") return null;
  if (!navigator.mediaDevices?.getUserMedia) return null;
  if (typeof window.MediaRecorder === "undefined") return null;
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) return null;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const chunks: Blob[] = [];
  // Bumped by cancel() and by every start(). A start() that finds the counter
  // moved on while it was awaiting the permission prompt no longer owns this
  // closure and must release what it acquired itself — the whole of C2: when
  // cancel() ran there was nothing acquired for it to release.
  let generation = 0;

  // Releasing the stream is not optional: a MediaStream left open keeps the
  // browser's recording indicator lit long after the feature is done with it.
  function release() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    // `void` discards the value, not a rejection: close() rejects on a context
    // that is already closed, and an unhandled rejection from a teardown path
    // is reported as an error the user never caused.
    void context?.close().catch(() => {});
    context = null;
  }

  // Everything this closure holds, put back. Both handlers are detached, not
  // just onstop: a MediaRecorder flushes a final `dataavailable` after stop(),
  // and a handler left installed pushes that chunk into `chunks` after they have
  // been cleared — the next recording then ships with the previous one's tail
  // spliced onto the front.
  function teardown() {
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorder = null;
    }
    chunks.length = 0;
    release();
  }

  return {
    async start(onFrame, frameMs) {
      const mine = ++generation;
      // Two toggle()s in one tick would otherwise both reach getUserMedia, and
      // the second would overwrite these locals — leaving the first stream and
      // its interval with no handle left for stop() or cancel() to reach.
      teardown();

      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });

      // cancel() (or a newer start()) landed while the permission prompt was
      // open. It released nothing, because nothing had been acquired when it
      // ran; releasing this stream is therefore this call's job, and the caller
      // must not be told a recording began.
      if (mine !== generation) {
        acquired.getTracks().forEach((t) => t.stop());
        throw new DOMException("The recording was cancelled.", "AbortError");
      }

      stream = acquired;
      try {
        chunks.length = 0;
        recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        // No timeslice: 50ms is the analyser's cadence, not the encoder's. Passing
        // it here cuts ~1200 Blobs a minute, where stop() flushes one complete
        // final `dataavailable` on its own.
        recorder.start();

        context = new AudioCtx();
        // The context is constructed after `await getUserMedia`, outside the
        // click's synchronous window, so autoplay policy can hand it back
        // suspended — and a suspended context's analyser reports pure silence,
        // which the VAD reads as "never spoke" and the hook drops as no-speech.
        if (context.state === "suspended") void context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.fftSize);

        // setInterval, not requestAnimationFrame: rAF stalls in a background tab,
        // which would freeze both the silence detector and the 60-second cap and
        // leave a microphone live indefinitely.
        timer = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const sample of buffer) {
            const centred = (sample - 128) / 128;
            sum += centred * centred;
          }
          onFrame(Math.sqrt(sum / buffer.length));
        }, frameMs);
      } catch (err) {
        // isTypeSupported is a generic query, not a per-stream guarantee, and
        // Chrome hard-caps AudioContexts per document — either can throw AFTER
        // getUserMedia already granted a live stream, and in the AudioContext
        // case the MediaRecorder may already be recording. A throw here must
        // not abandon either: the next start() would overwrite these locals
        // and orphan whatever was already acquired, leaving the browser's
        // recording indicator lit with no way for the caller to reach it.
        teardown();
        throw err;
      }
    },

    stop() {
      return new Promise<RecordedAudio>((resolve, reject) => {
        const active = recorder;
        if (!active) { reject(new Error("not recording")); return; }
        if (active.state === "inactive") {
          // The device can go away on its own (unplugged, track ended) before
          // we ask it to stop. Release everything anyway: an interval left
          // running with no recorder left to stop would keep feeding frames
          // into the caller's VAD loop, which would call stop() again on
          // every subsequent silent frame forever.
          teardown();
          reject(new Error("recorder already inactive"));
          return;
        }
        try {
          active.onstop = () => {
            release();
            recorder = null;
            resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
          };
          active.stop();
        } catch (err) {
          // Not teardown(): active.stop() has just thrown, and calling it again
          // would throw again from inside this executor. Detach both handlers by
          // hand so a late event cannot resolve a promise that is being rejected.
          active.ondataavailable = null;
          active.onstop = null;
          recorder = null;
          chunks.length = 0;
          release();
          reject(err);
        }
      });
    },

    cancel() {
      // Bumping the generation is the half that teardown() cannot do: an
      // in-flight start() has acquired nothing yet, so there is nothing here to
      // release and the counter is the only record this cancel() ever happened.
      generation += 1;
      teardown();
    },
  };
}
