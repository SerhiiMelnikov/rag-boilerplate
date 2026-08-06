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

type MountOpts = Partial<Parameters<typeof useMicrophone>[0]> & { recorder: Recorder | null };

function mount(opts: MountOpts) {
  const handle: { current: Handle | null } = { current: null };
  function Host(props: MountOpts) {
    handle.current = useMicrophone({ onTranscript: vi.fn(), disabled: false, ...props });
    return null;
  }
  const view = render(<Host {...opts} />);
  return {
    handle,
    view,
    /** Re-renders with new opts merged over the original — for tests that flip a prop like `disabled` mid-flight. */
    update(next: Partial<MountOpts>) {
      view.rerender(<Host {...opts} {...next} />);
    },
  };
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

  it("still allows a manual stop while disabled mid-recording", async () => {
    // The asymmetry that makes the alternative a bug: the VAD's own auto-stop
    // calls finish() directly and is never blocked by `disabled`. A manual
    // stop must be just as reachable — otherwise submitting a typed message
    // while recording strands a live microphone with no way to end it.
    const rec = fakeRecorder();
    const { handle, update } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    expect(handle.current!.state).toBe<MicState>("recording");
    update({ disabled: true });
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(rec.api.stop).toHaveBeenCalledTimes(1));
  });

  it("stops and sends the transcript on a second toggle", async () => {
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const transcribeFn = vi.fn(async () => "how many documents");
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);   // 400ms of speech, over the 300ms floor — clears the silence gate
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
    // The provider itself can still come back empty even when speech was
    // heard (e.g. inaudible mumbling) — this exercises the `text !== ""`
    // guard downstream of the silence gate, not the gate itself, so it must
    // clear the gate first or it would pass for the wrong reason.
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const transcribeFn = vi.fn(async () => "");
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);   // 400ms of speech, over the 300ms floor — clears the silence gate
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.state).toBe<MicState>("idle"));
    expect(transcribeFn).toHaveBeenCalledTimes(1);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("does not transcribe a recording with no speech in it", async () => {
    // The user pressed the button, said nothing, and pressed it again. Sending
    // that costs money and, worse, gets a confident answer back: handed silence,
    // Gemini echoes the instruction and Whisper hallucinates. Neither is empty,
    // so no downstream string check can catch it — the request must not happen.
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const transcribeFn = vi.fn(async () => "should never be called");
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn });
    await act(async () => handle.current!.toggle());
    rec.feed(20, 0.0);                       // 1 second of silence, no speech at all
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.state).toBe<MicState>("idle"));
    expect(transcribeFn).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("still releases the microphone when it drops a silent recording", async () => {
    // Dropping the request must not skip the teardown: an unreleased MediaStream
    // keeps the browser's recording indicator lit.
    const rec = fakeRecorder();
    const { handle } = mount({ recorder: rec.api, transcribeFn: vi.fn(async () => "x") });
    await act(async () => handle.current!.toggle());
    rec.feed(20, 0.0);
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.state).toBe<MicState>("idle"));
    expect(rec.api.stop).toHaveBeenCalledTimes(1);
  });

  it("tells the user why nothing was sent", async () => {
    // Silence rather than a message would be worse: the energy threshold is
    // unverified against real rooms, so if it ever eats genuine speech the user
    // must be able to see that it did, not just watch nothing happen.
    const rec = fakeRecorder();
    const { handle } = mount({ recorder: rec.api, transcribeFn: vi.fn(async () => "x") });
    await act(async () => handle.current!.toggle());
    rec.feed(20, 0.0);
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toMatch(/no speech/i));
  });

  it("still transcribes a recording that does contain speech", async () => {
    // The control case. Without it, a gate that blocked everything would pass
    // all three tests above.
    const rec = fakeRecorder();
    const onTranscript = vi.fn();
    const transcribeFn = vi.fn(async () => "how many documents");
    const { handle } = mount({ recorder: rec.api, onTranscript, transcribeFn });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);                        // 400ms of speech, over the 300ms floor
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("how many documents"));
    expect(transcribeFn).toHaveBeenCalledTimes(1);
  });

  it("reports a refused microphone", async () => {
    const rec = fakeRecorder();
    rec.api.start.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    await waitFor(() => expect(handle.current!.error).toMatch(/refused/i));
    expect(handle.current!.state).toBe<MicState>("idle");
  });

  it("cancels the recorder when start() throws after acquiring something", async () => {
    // Models recorder.ts's own scenario: getUserMedia succeeds and the
    // MediaRecorder is started, and only THEN does AudioContext construction
    // throw (Chrome's per-document cap). "acquired" and "released" are kept as
    // distinct states from "never" so this test cannot pass on a recorder that
    // was simply never touched — it must specifically observe a release.
    let status: "never" | "acquired" | "released" = "never";
    const recorder: Recorder = {
      start: vi.fn(async () => {
        status = "acquired";
        throw new Error("AudioContext construction failed");
      }),
      stop: vi.fn(async () => AUDIO),
      cancel: vi.fn(() => { status = "released"; }),
    };
    const { handle } = mount({ recorder });
    await act(async () => handle.current!.toggle());
    expect(status).toBe("released");
    expect(handle.current!.error).toBeTruthy();
    expect(handle.current!.state).toBe<MicState>("idle");
  });

  it("cancels the recorder and stops the frame loop when stop() rejects", async () => {
    // A device can disappear on its own (unplugged, track ended) between the
    // VAD deciding to stop and stop() actually running, so stop() can reject
    // without having released anything. Without a cancel() here, the frame
    // loop survives and every later silent frame trips the VAD's "silence"
    // stop again, calling finish() -> stop() again forever.
    const rec = fakeRecorder();
    rec.api.stop.mockRejectedValueOnce(new Error("InvalidStateError"));
    const { handle } = mount({ recorder: rec.api });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);   // 400ms of speech, clears the floor
    rec.feed(30, 0.0);  // 1500ms of silence: trips the auto-stop -> finish() -> stop() rejects
    await waitFor(() => expect(handle.current!.error).toBeTruthy());
    expect(rec.api.stop).toHaveBeenCalledTimes(1);
    expect(rec.api.cancel).toHaveBeenCalledTimes(1);
    // fakeRecorder's cancel() nulls the installed frame callback, exactly what
    // the real recorder's release() does by clearing its interval. Further
    // frames must therefore have nowhere left to go.
    rec.feed(5, 0.0);
    expect(rec.api.stop).toHaveBeenCalledTimes(1);
  });

  it("maps a 429 to the voice limit message", async () => {
    const rec = fakeRecorder();
    const { handle } = mount({
      recorder: rec.api,
      transcribeFn: async () => { throw Object.assign(new Error("rate limited"), { status: 429 }); },
    });
    await act(async () => handle.current!.toggle());
    rec.feed(8, 0.2);   // 400ms of speech, over the 300ms floor — clears the silence gate
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
    rec.feed(8, 0.2);   // 400ms of speech, over the 300ms floor — clears the silence gate
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
