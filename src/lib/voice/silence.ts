// The auto-stop rule, as a pure reducer over a series of per-frame energies.
//
// Three things here are load-bearing, and each exists because the obvious
// version fails in a real room:
//
//   * minSpeechMs — without a speech floor, a room's noise never crossing the
//     threshold would end the recording before a word was said.
//   * maxDurationMs — in a noisy room the trailing silence never arrives, and a
//     microphone with no cap stays open indefinitely.
//   * a manual stop, which lives in the hook rather than here: VAD misfires,
//     and a keyboard user must always be able to end a recording.
export interface VadState {
  /** Cumulative milliseconds of frames at or above the threshold. */
  spokeMs: number;
  /** Milliseconds since the last such frame. */
  silentMs: number;
  /** Milliseconds since recording began. */
  elapsedMs: number;
}

export type VadStop = "silence" | "timeout" | null;

export interface VadOptions {
  /** Normalised RMS. Below this a frame counts as silence. */
  threshold: number;
  /** Silence cannot stop a recording until this much speech has been heard. */
  minSpeechMs: number;
  /** Trailing silence that ends a recording. */
  trailingSilenceMs: number;
  /** Hard cap. In a noisy room silence never arrives. */
  maxDurationMs: number;
}

export const VAD_DEFAULTS: VadOptions = {
  threshold: 0.02,
  minSpeechMs: 300,
  trailingSilenceMs: 1500,
  maxDurationMs: 60_000,
};

export const INITIAL_VAD_STATE: VadState = { spokeMs: 0, silentMs: 0, elapsedMs: 0 };

export function stepVad(
  state: VadState,
  energy: number,
  frameMs: number,
  opts: Partial<VadOptions> = {},
): { state: VadState; stop: VadStop } {
  const { threshold, minSpeechMs, trailingSilenceMs, maxDurationMs } = { ...VAD_DEFAULTS, ...opts };

  const speaking = energy >= threshold;
  const next: VadState = {
    spokeMs: speaking ? state.spokeMs + frameMs : state.spokeMs,
    silentMs: speaking ? 0 : state.silentMs + frameMs,
    elapsedMs: state.elapsedMs + frameMs,
  };

  // The cap wins over everything, including a frame that just registered
  // speech: it is a hard stop, not a preference.
  if (next.elapsedMs >= maxDurationMs) return { state: next, stop: "timeout" };
  if (next.spokeMs >= minSpeechMs && next.silentMs >= trailingSilenceMs) return { state: next, stop: "silence" };
  return { state: next, stop: null };
}
