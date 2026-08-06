// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act, waitFor } from "@testing-library/react";
import { useMicrophone, type MicState } from "./use-microphone";
import type { Recorder, RecordedAudio } from "./recorder";

const AUDIO: RecordedAudio = { blob: new Blob(["x"], { type: "audio/webm" }), mimeType: "audio/webm;codecs=opus" };

function fakeRecorder() {
  let frame: ((energy: number) => void) | null = null;
  const api = {
    start: vi.fn(async (onFrame: (e: number) => void) => { frame = onFrame; }),
    stop: vi.fn(async () => AUDIO),
    cancel: vi.fn(() => { frame = null; }),
  } satisfies Recorder;
  return {
    api,
    /** Drives n frames of the given energy through whatever the hook installed. */
    feed(n: number, energy: number) {
      for (let i = 0; i < n; i++) act(() => frame?.(energy));
    },
    /**
     * Fires a single frame directly, with no act() of its own — so a caller can
     * land it inside the SAME act() as another call, e.g. a manual toggle().
     */
    fire(energy: number) {
      frame?.(energy);
    },
    get started() { return frame !== null; },
  };
}

type Handle = ReturnType<typeof useMicrophone>;

function mount(opts: Partial<Parameters<typeof useMicrophone>[0]> & { recorder: Recorder | null }) {
  const handle: { current: Handle | null } = { current: null };
  function Host() {
    handle.current = useMicrophone({ onTranscript: vi.fn(), disabled: false, ...opts });
    return null;
  }
  const view = render(<Host />);
  return { handle, view };
}

afterEach(cleanup);

describe("useMicrophone", () => {
  it("starts recording on the first toggle", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    expect(rec.api.start).toHaveBeenCalledTimes(1);
    expect(handle.current!.state).toBe<MicState>("recording");
  });

  it("does nothing while disabled", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({ recorder: rec.api, disabled: true });
    await act(async () => handle.current!.toggle());
    expect(rec.api.start).not.toHaveBeenCalled();
    expect(handle.current!.state).toBe<MicState>("idle");
  });

  it("stops and sends the transcript on a second toggle", async () => {
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const transcribeFn = vi.fn(async () => "how many documents");
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn });
    await act(async () => handle.current!.toggle());
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("how many documents"));
    expect(transcribeFn).toHaveBeenCalledWith(AUDIO);
    expect(handle.current!.state).toBe<MicState>("idle");
  });

  it("stops itself after trailing silence", async () => {
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn: async () => "spoken" });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);    // 400ms of speech, over the 300ms floor
    rec.feed(30, 0.0);   // 1500ms of silence
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("spoken"));
    expect(rec.api.stop).toHaveBeenCalledTimes(1);
  });

  it("does not send an empty transcript", async () => {
    // Silence recorded by accident must not spend a model request.
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn: async () => "" });
    await act(async () => handle.current!.toggle());
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.state).toBe<MicState>("idle"));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("reports a refused microphone", async () => {
    const rec = fakeRecorder();
    rec.api.start.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toMatch(/refused/i));
    expect(handle.current!.state).toBe<MicState>("idle");
  });

  it("maps a 429 to the voice limit message", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({
      recorder: rec.api,
      transcribeFn: async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); },
    });
    await act(async () => handle.current!.toggle());
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toMatch(/voice limit/i));
  });

  it("maps a 503 to the not-configured message", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({
      recorder: rec.api,
      transcribeFn: async () => { throw Object.assign(new Error("unconfigured"), { status: 503 }); },
    });
    await act(async () => handle.current!.toggle());
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toMatch(/not configured/i));
  });

  it("clears the previous error when a new recording starts", async () => {
    const rec = fakeRecorder();
    rec.api.start.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toBeTruthy());
    await act(async () => handle.current!.toggle());
    expect(handle.current!.error).toBeNull();
  });

  it("cancels on unmount", async () => {
    const rec = fakeRecorder();
    const { handle, view } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    view.unmount();
    expect(rec.api.cancel).toHaveBeenCalled();
  });

  it("does not stop twice when a manual press lands in the same tick as the VAD auto-stop", async () => {
    // finishing.current exists precisely for this: the VAD's own onFrame
    // callback calls finish() synchronously (up to its first await), and if a
    // manual toggle() lands in that same synchronous tick it reads the
    // not-yet-rerendered "recording" state and would call finish() again.
    // Without the guard both calls proceed to stop() and, downstream, to a
    // second transcribe request.
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn: async () => "spoken" });
    await act(async () => handle.current!.toggle());
    act(() => { for (let i = 0; i < 6; i++) rec.fire(0.2); }); // 300ms speech: clears the floor
    act(() => { for (let i = 0; i < 29; i++) rec.fire(0.0); }); // 1450ms silence: not yet at the trailing cap
    act(() => {
      // The 30th silent frame is the one that trips the VAD's "silence" stop.
      // The manual press below lands in the exact same synchronous batch.
      rec.fire(0.0);
      handle.current!.toggle();
    });
    await waitFor(() => expect(handle.current!.state).toBe<MicState>("idle"));
    expect(rec.api.stop).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledTimes(1);
  });

  it("reports supported: false when there is no recorder", () => {
    // browserRecorder() returns null on a browser that cannot record. The view
    // renders no button on this, rather than one that fails on press.
    const { handle } = mount({ recorder: null });
    expect(handle.current!.supported).toBe(false);
  });

  it("exposes elapsed time while recording", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    rec.feed(10, 0.2);
    expect(handle.current!.elapsedMs).toBe(500);
  });
});
