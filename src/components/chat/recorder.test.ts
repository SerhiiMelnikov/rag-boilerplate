// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { browserRecorder } from "./recorder";

// jsdom implements neither MediaRecorder, nor getUserMedia, nor AudioContext,
// which is why this file shipped with no tests at all — and why both of this
// branch's resource-release defects lived here.
//
// browserRecorder() reads all three DYNAMICALLY: navigator.mediaDevices inside
// start(), window.MediaRecorder and window.AudioContext when the factory itself
// runs. So fakes installed on the globals BEFORE the factory call drive the real
// implementation, with no seam added to production code for the test's benefit.
//
// What these tests assert is deliberately not "cancel() was called": that proves
// nothing about a microphone. They observe the two things a leak actually
// consists of — a MediaStreamTrack still in readyState "live", and an interval
// still registered — directly.

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeTrack {
  readyState: "live" | "ended" = "live";
  stop() {
    this.readyState = "ended";
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];
  constructor(readonly label: string) {
    this.tracks = [new FakeTrack(), new FakeTrack()];
    allTracks.push(...this.tracks);
  }
  getTracks() {
    return this.tracks;
  }
}

const CHUNK_TEXT = "chunk";

class FakeMediaRecorder {
  static supported: string[] = ["audio/webm;codecs=opus"];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.includes(type);
  }
  /** Makes stop() throw the way an InvalidStateError from the encoder would. */
  static throwOnStop = false;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  /** Every argument list start() was called with — the timeslice question. */
  readonly startCalls: unknown[][] = [];
  constructor(
    readonly stream: FakeStream,
    readonly options: { mimeType: string },
  ) {
    recorders.push(this);
  }
  start(...args: unknown[]) {
    this.startCalls.push(args);
    this.state = "recording";
  }
  stop() {
    if (FakeMediaRecorder.throwOnStop) throw new Error("InvalidStateError");
    this.state = "inactive";
    // A real MediaRecorder.stop() is asynchronous: it queues a final
    // `dataavailable` carrying whatever the encoder still held, and only then
    // `stop`. Modelling that as a macrotask (rather than firing both inline) is
    // what makes a handler left installed across a cancel() observable at all.
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob([CHUNK_TEXT], { type: this.options.mimeType }) });
      this.onstop?.();
    }, 0);
  }
}

class FakeAnalyser {
  fftSize = 0;
  getByteTimeDomainData(buffer: Uint8Array) {
    buffer.fill(sampleValue);
  }
}

class FakeAudioContext {
  static throwOnConstruct = false;
  static initialState: "running" | "suspended" = "running";
  state: "running" | "suspended" | "closed";
  closed = false;
  resumed = 0;
  /** The value close() handed back, so a test can see whether it was caught. */
  closeResult: { caught: boolean } | null = null;
  constructor() {
    if (FakeAudioContext.throwOnConstruct) {
      // Chrome hard-caps AudioContexts per document; this is the real throw.
      throw new Error("Failed to construct 'AudioContext'");
    }
    this.state = FakeAudioContext.initialState;
    contexts.push(this);
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  createMediaStreamSource(_stream: FakeStream) {
    return { connect: (_target: unknown) => undefined };
  }
  resume() {
    this.resumed += 1;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = "closed";
    // close() rejects for real when the context is already closed. Returned as
    // a thenable whose catch() is observable, so "the rejection is handled" is
    // an assertion rather than a hope.
    const settled = closeRejects ? Promise.reject(new Error("InvalidStateError")) : Promise.resolve();
    const result = {
      caught: false,
      catch(onRejected: (reason: unknown) => void) {
        result.caught = true;
        return settled.catch(onRejected);
      },
      then(onFulfilled?: () => void, onRejected?: (reason: unknown) => void) {
        return settled.then(onFulfilled, onRejected);
      },
    };
    this.closeResult = result;
    return result as unknown as Promise<void>;
  }
}

// ---------------------------------------------------------------------------
// Shared state, reset per test
// ---------------------------------------------------------------------------

let allTracks: FakeTrack[] = [];
let recorders: FakeMediaRecorder[] = [];
let contexts: FakeAudioContext[] = [];
let sampleValue = 128;
let closeRejects = false;
let gumCalls = 0;
let getUserMedia: () => Promise<FakeStream>;

/** Intervals registered and not yet cleared — the leak this file is about. */
const liveIntervals = new Map<number, () => void>();
let nextIntervalId = 1;

function liveTracks() {
  return allTracks.filter((t) => t.readyState === "live");
}

/** Runs every still-registered interval callback once. */
function tickFrames(n = 1) {
  for (let i = 0; i < n; i++) for (const fn of [...liveIntervals.values()]) fn();
}

/** Lets pending macrotasks (the fake MediaRecorder's stop events) run. */
function flushEvents() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A getUserMedia the test resolves by hand — the permission-prompt window. */
function pendingPermission() {
  let grant!: (label: string) => void;
  const promise = new Promise<FakeStream>((resolve) => {
    grant = (label: string) => resolve(new FakeStream(label));
  });
  return { promise, grant };
}

function installGlobals() {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () => {
        gumCalls += 1;
        return getUserMedia();
      },
    },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  // The recorder's interval is counted rather than run on a real clock: what
  // matters is whether one is still registered after a teardown, not when it
  // fires. Wrapping the globals is also what lets tickFrames() drive the
  // analyser loop synchronously.
  vi.stubGlobal("setInterval", (fn: () => void) => {
    const id = nextIntervalId++;
    liveIntervals.set(id, fn);
    return id;
  });
  vi.stubGlobal("clearInterval", (id: number) => {
    liveIntervals.delete(id);
  });
}

beforeEach(() => {
  allTracks = [];
  recorders = [];
  contexts = [];
  sampleValue = 128;
  closeRejects = false;
  gumCalls = 0;
  liveIntervals.clear();
  nextIntervalId = 1;
  FakeMediaRecorder.supported = ["audio/webm;codecs=opus"];
  FakeMediaRecorder.throwOnStop = false;
  FakeAudioContext.throwOnConstruct = false;
  FakeAudioContext.initialState = "running";
  getUserMedia = async () => new FakeStream("default");
  installGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("browserRecorder capability check", () => {
  it("is null when the browser has no MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(browserRecorder()).toBeNull();
  });

  it("is null when the browser has no AudioContext at all", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(browserRecorder()).toBeNull();
  });

  it("is null when no offered container is one the endpoint accepts", () => {
    FakeMediaRecorder.supported = ["audio/flac"];
    expect(browserRecorder()).toBeNull();
  });

  it("is a recorder when every piece is present", () => {
    expect(browserRecorder()).not.toBeNull();
  });
});

describe("start/stop", () => {
  it("records with the negotiated type and releases everything on stop", async () => {
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);

    expect(recorders).toHaveLength(1);
    expect(recorders[0].options.mimeType).toBe("audio/webm;codecs=opus");
    expect(liveTracks()).toHaveLength(2);
    expect(liveIntervals.size).toBe(1);

    const pending = rec.stop();
    await flushEvents();
    const audio = await pending;

    expect(audio.mimeType).toBe("audio/webm;codecs=opus");
    expect(audio.blob.size).toBe(CHUNK_TEXT.length);
    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
    expect(contexts[0].closed).toBe(true);
  });

  it("asks MediaRecorder for one blob, not one per analyser frame", async () => {
    // 50ms is the analyser cadence, not an encoder timeslice. Passing it to
    // start() makes the encoder cut ~1200 Blobs a minute; stop() flushes a
    // final dataavailable on its own, so no argument is needed for a complete
    // recording.
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    expect(recorders[0].startCalls).toEqual([[]]);
  });

  it("reports normalised RMS energy per frame", async () => {
    // 192 is 64 above the 128 midpoint, i.e. half of full scale, so every
    // sample centres to 0.5 and the RMS of a constant 0.5 is 0.5. A frame loop
    // that forgot to centre or to normalise cannot produce this number.
    sampleValue = 192;
    const frames: number[] = [];
    const rec = browserRecorder()!;
    await rec.start((e) => frames.push(e), 50);
    tickFrames(2);
    expect(frames).toEqual([0.5, 0.5]);
    rec.cancel();
  });

  it("resumes a context that autoplay policy left suspended", async () => {
    // The AudioContext is constructed after `await getUserMedia`, outside the
    // click's synchronous window, so the browser may hand it back suspended —
    // and a suspended context's analyser reports pure silence, which the VAD
    // would read as "never spoke" and drop the recording.
    FakeAudioContext.initialState = "suspended";
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    expect(contexts[0].resumed).toBe(1);
    rec.cancel();
  });

  it("rejects stop() when nothing is recording", async () => {
    const rec = browserRecorder()!;
    await expect(rec.stop()).rejects.toThrow(/not recording/i);
  });
});

describe("release on failure", () => {
  it("an AudioContext constructor that throws still stops every track and clears the interval", async () => {
    // isTypeSupported is a generic query and Chrome caps AudioContexts per
    // document: either can throw AFTER getUserMedia has already granted a live
    // stream and the MediaRecorder has already started. Abandoning them leaves
    // the browser's recording indicator lit with no handle left to reach them.
    FakeAudioContext.throwOnConstruct = true;
    const rec = browserRecorder()!;

    await expect(rec.start(() => {}, 50)).rejects.toThrow(/AudioContext/);

    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
    expect(recorders[0].state).toBe("inactive");
  });

  it("releases everything when the device went away before stop() was asked", async () => {
    // A track can end on its own — the headset is unplugged, the tab loses the
    // device — and the MediaRecorder is already "inactive" by the time the VAD
    // asks to stop. Rejecting without releasing would leave the frame interval
    // running with no recorder left to stop, and every subsequent silent frame
    // would trip the caller's VAD into calling stop() again, forever.
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    recorders[0].state = "inactive";

    await expect(rec.stop()).rejects.toThrow(/already inactive/i);

    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
  });

  it("a stop() that throws releases everything and cannot contaminate the next recording", async () => {
    // stop() can throw after the encoder has already scheduled its flush. The
    // rollback must detach BOTH handlers, not just onstop: a `dataavailable`
    // left installed lands after the next start() has cleared the chunk list,
    // and that recording then ships with this one's tail spliced onto the front.
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    const failed = recorders[0];
    FakeMediaRecorder.throwOnStop = true;

    await expect(rec.stop()).rejects.toThrow(/InvalidStateError/);

    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);

    FakeMediaRecorder.throwOnStop = false;
    await rec.start(() => {}, 50);
    // The abandoned recorder's queued events, delivered late — what a browser
    // that got as far as scheduling the flush before failing would deliver.
    failed.ondataavailable?.({ data: new Blob(["stale"], { type: "audio/webm" }) });
    failed.onstop?.();

    const pending = rec.stop();
    await flushEvents();
    const audio = await pending;
    expect(audio.blob.size).toBe(CHUNK_TEXT.length);
  });

  it("leaves nothing live when getUserMedia itself refuses", async () => {
    getUserMedia = async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    };
    const rec = browserRecorder()!;
    await expect(rec.start(() => {}, 50)).rejects.toThrow(/denied/);
    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
  });
});

describe("cancel", () => {
  it("does not throw when nothing has ever been started", () => {
    const rec = browserRecorder()!;
    expect(() => rec.cancel()).not.toThrow();
  });

  it("stops every track and clears the interval mid-recording", async () => {
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    rec.cancel();
    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
    expect(recorders[0].state).toBe("inactive");
  });

  it("cancel() during a pending getUserMedia leaves no live track", async () => {
    // The navigation case. useMicrophone sets "requesting" and awaits the
    // permission prompt; the user clicks another conversation, ChatPage
    // remounts ChatView, and the hook's unmount cleanup calls cancel(). Nothing
    // has been acquired yet, so a cancel() that only inspects the locals
    // releases nothing — and when the user then presses Allow, the microphone
    // goes live on an unmounted tree with no UI anywhere indicating it.
    const permission = pendingPermission();
    getUserMedia = () => permission.promise;

    const rec = browserRecorder()!;
    const starting = rec.start(() => {}, 50);

    rec.cancel();
    permission.grant("granted-after-cancel");

    // allSettled, not `rejects.toThrow()`: a rejection is the mechanism, but
    // the assertions that matter are the three below, and a failed expectation
    // on the promise's shape would stop the test before it ever reached them.
    const [outcome] = await Promise.allSettled([starting]);

    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
    expect(contexts).toHaveLength(0);
    // The caller has to learn the start did not happen, or useMicrophone would
    // set state to "recording" for a microphone that is not.
    expect(outcome.status).toBe("rejected");
  });

  it("a start() on an already-running recorder releases the previous one first", async () => {
    // The sequential half of the same defect as the same-tick test below, and
    // the one the generation counter alone does NOT cover: the first start()
    // has already resolved, so it will never re-check the counter. Only the
    // teardown() at the top of start() can reach what it left behind, and
    // without it that stream stays live and its interval keeps firing for the
    // rest of the page's life — no handle to either survives the overwrite.
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    const firstTracks = [...allTracks];

    await rec.start(() => {}, 50);

    expect(firstTracks.every((t) => t.readyState === "ended")).toBe(true);
    expect(liveTracks()).toHaveLength(2);
    expect(liveIntervals.size).toBe(1);
    expect(recorders[0].state).toBe("inactive");
    expect(contexts[0].closed).toBe(true);
  });

  it("a second start() in the same tick does not orphan the first stream", async () => {
    // Two toggle()s in one tick: both reach getUserMedia, and the second
    // overwrites the closure's locals. Whatever the first acquired then has no
    // handle left, so neither stop() nor cancel() can ever reach it.
    const first = pendingPermission();
    const second = pendingPermission();
    getUserMedia = () => (gumCalls === 1 ? first.promise : second.promise);

    const rec = browserRecorder()!;
    const a = rec.start(() => {}, 50);
    const b = rec.start(() => {}, 50);

    first.grant("first");
    second.grant("second");
    await Promise.allSettled([a, b]);

    // Exactly one recording survives, and it is the second one.
    expect(liveTracks()).toHaveLength(2);
    expect(liveTracks().every((t) => allTracks.indexOf(t) >= 2)).toBe(true);
    expect(liveIntervals.size).toBe(1);

    rec.cancel();
    expect(liveTracks()).toHaveLength(0);
    expect(liveIntervals.size).toBe(0);
  });

  it("a cancelled recorder cannot feed its final chunk into the next recording", async () => {
    // cancel() detaches onstop but the encoder's queued `dataavailable` is a
    // separate event: left installed, it lands after the next start() has
    // cleared the chunk list and the following recording ships with the
    // previous one's tail spliced onto the front.
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    rec.cancel();

    await rec.start(() => {}, 50);
    await flushEvents(); // the first recorder's queued stop events land here

    const pending = rec.stop();
    await flushEvents();
    const audio = await pending;

    expect(audio.blob.size).toBe(CHUNK_TEXT.length);
  });

  it("handles a close() that rejects rather than leaving it unhandled", async () => {
    // close() rejects on an already-closed context. `void promise` discards the
    // value, not the rejection.
    closeRejects = true;
    const rec = browserRecorder()!;
    await rec.start(() => {}, 50);
    rec.cancel();
    expect(contexts[0].closeResult?.caught).toBe(true);
    await flushEvents();
  });
});
