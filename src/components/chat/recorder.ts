"use client";

import { pickMimeType } from "@/lib/voice/mime";

export interface RecordedAudio {
  blob: Blob;
  /** As MediaRecorder reported it, codec parameter included. */
  mimeType: string;
}

// The seam between the hook and the browser's recording APIs.
//
// It emits a scalar energy per frame rather than an AnalyserNode, and returns a
// Blob rather than a MediaRecorder, for the same reason SpeechEngine takes a
// string instead of an utterance: jsdom implements none of these constructors,
// so a test could not build an argument for the real signature.
export interface Recorder {
  /** Requests the microphone and starts. Rejects if permission is refused. */
  start(onFrame: (energy: number) => void, frameMs: number): Promise<void>;
  /** Stops and resolves with what was captured. */
  stop(): Promise<RecordedAudio>;
  /** Stops, discards, releases the stream. Safe at any time, including idle. */
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

  // Releasing the stream is not optional: a MediaStream left open keeps the
  // browser's recording indicator lit long after the feature is done with it.
  function release() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    void context?.close();
    context = null;
  }

  return {
    async start(onFrame, frameMs) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.length = 0;
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start(frameMs);

      context = new AudioCtx();
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
    },

    stop() {
      return new Promise<RecordedAudio>((resolve, reject) => {
        const active = recorder;
        if (!active) { reject(new Error("not recording")); return; }
        active.onstop = () => {
          release();
          recorder = null;
          resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
        };
        active.stop();
      });
    },

    cancel() {
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      recorder = null;
      chunks.length = 0;
      release();
    },
  };
}
