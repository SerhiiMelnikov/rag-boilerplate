import { describe, it, expect } from "vitest";
import { stepVad, INITIAL_VAD_STATE, VAD_DEFAULTS, type VadState, type VadStop } from "./silence";

const FRAME = 50;

// Feeds a series of energies and returns the first stop reason and the frame it
// happened on (1-based), or null if the series never stops.
function run(energies: number[], opts?: Parameters<typeof stepVad>[3]): { stop: VadStop; atFrame: number | null } {
  let state: VadState = INITIAL_VAD_STATE;
  for (let i = 0; i < energies.length; i++) {
    const out = stepVad(state, energies[i], FRAME, opts);
    state = out.state;
    if (out.stop) return { stop: out.stop, atFrame: i + 1 };
  }
  return { stop: null, atFrame: null };
}

const LOUD = 0.2;
const QUIET = 0.001;
const frames = (n: number, energy: number) => Array<number>(n).fill(energy);

describe("stepVad", () => {
  it("never stops on silence alone, however long", () => {
    // A microphone left open in a quiet room must not report a finished
    // recording — there is nothing to transcribe.
    expect(run(frames(100, QUIET)).stop).toBeNull();
  });

  it("does not stop until minSpeechMs of speech has been heard", () => {
    // 100ms of speech (2 frames) then a long silence: below the 300ms floor.
    expect(run([...frames(2, LOUD), ...frames(100, QUIET)]).stop).toBeNull();
  });

  it("stops after trailingSilenceMs once enough speech has been heard", () => {
    // 400ms speech (8 frames) then silence. 1500ms = 30 frames.
    const { stop, atFrame } = run([...frames(8, LOUD), ...frames(40, QUIET)]);
    expect(stop).toBe("silence");
    expect(atFrame).toBe(8 + 30);
  });

  it("resets the silence run whenever speech resumes", () => {
    // A pause between two sentences must not end the recording.
    const series = [...frames(8, LOUD), ...frames(20, QUIET), ...frames(8, LOUD), ...frames(20, QUIET)];
    expect(run(series).stop).toBeNull();
  });

  it("counts speech cumulatively across pauses", () => {
    // 150ms + 150ms of speech is 300ms: enough for the floor.
    const series = [...frames(3, LOUD), ...frames(5, QUIET), ...frames(3, LOUD), ...frames(30, QUIET)];
    expect(run(series).stop).toBe("silence");
  });

  it("stops at the hard cap even under continuous speech", () => {
    // 60s / 50ms = 1200 frames.
    const { stop, atFrame } = run(frames(2000, LOUD));
    expect(stop).toBe("timeout");
    expect(atFrame).toBe(1200);
  });

  it("prefers timeout over silence when both land on the same frame", () => {
    // The cap is a hard stop; which reason is reported decides nothing about
    // the audio, but a stable answer is what the hook's tests can rely on.
    //
    // The brief drafted this with maxDurationMs: 400, but that does not land
    // on the same frame as the silence stop: with minSpeechMs: 100 (2 loud
    // frames) and trailingSilenceMs: 200 (4 quiet frames), the silence
    // condition is already true at elapsedMs 300 (frame 6) — two frames
    // before a 400ms cap would ever fire, so "silence" wins there, not
    // "timeout". Setting maxDurationMs to that same 300 makes both
    // conditions become true on the identical call to stepVad, which is what
    // this test needs in order to actually exercise the tie-break.
    const opts = { maxDurationMs: 300, minSpeechMs: 100, trailingSilenceMs: 200 };
    const { stop } = run([...frames(2, LOUD), ...frames(6, QUIET)], opts);
    expect(stop).toBe("timeout");
  });

  it("treats energy exactly at the threshold as speech", () => {
    const series = [...frames(8, VAD_DEFAULTS.threshold), ...frames(40, QUIET)];
    expect(run(series).stop).toBe("silence");
  });

  it("merges partial options over the defaults", () => {
    const { stop, atFrame } = run([...frames(8, LOUD), ...frames(40, QUIET)], { trailingSilenceMs: 500 });
    expect(stop).toBe("silence");
    expect(atFrame).toBe(8 + 10);
  });
});
