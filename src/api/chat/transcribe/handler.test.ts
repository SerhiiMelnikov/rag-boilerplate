import { describe, it, expect, vi } from "vitest";
import { handleTranscribe, transcribeAvailability, baseMimeType } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";
import { MissingProviderKeyError } from "@/lib/providers/types";

const user = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));

const SETTINGS = {
  speechProvider: "google",
  speechModel: "gemini-2.5-flash",
  transcribeRateLimitPerMinute: 10,
  transcribeRateLimitPerDay: 100,
  keys: { google: "g", openai: null, anthropic: null },
};

const allow = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));

function audioRequest(opts: { type?: string; bytes?: number; field?: string } = {}) {
  const form = new FormData();
  const size = opts.bytes ?? 32;
  const blob = new Blob([new Uint8Array(size)], { type: opts.type ?? "audio/webm;codecs=opus" });
  form.append(opts.field ?? "audio", blob, "recording");
  return new Request("http://localhost/api/chat/transcribe", { method: "POST", body: form });
}

function deps(over: Record<string, unknown> = {}) {
  return {
    getSession: (async () => ({ id: "u1", role: "user" })) as never,
    getAuthUser: user as never,
    getSettingsFn: (async () => SETTINGS) as never,
    rateLimitFn: allow as never,
    transcribeFn: (async () => "hello there") as never,
    ...over,
  };
}

describe("baseMimeType", () => {
  it("drops the codecs parameter", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
  });
  it("trims and lowercases", () => {
    expect(baseMimeType("  AUDIO/MP4 ; codecs=mp4a ")).toBe("audio/mp4");
  });
  it("passes a bare type through", () => {
    expect(baseMimeType("audio/wav")).toBe("audio/wav");
  });
});

describe("handleTranscribe", () => {
  it("401s when not signed in", async () => {
    const transcribeFn = vi.fn();
    const res = await handleTranscribe(audioRequest(), deps({
      getSession: (async () => { throw new UnauthorizedError(); }) as never,
      transcribeFn: transcribeFn as never,
    }));
    expect(res.status).toBe(401);
    expect(transcribeFn).not.toHaveBeenCalled();
  });

  it("429s on the minute rule without consuming the day rule", async () => {
    const rateLimitFn = vi.fn(async (key: string) =>
      key.startsWith("transcribe:minute") ? { allowed: false, retryAfterSeconds: 7 } : { allowed: true, retryAfterSeconds: 0 });
    const res = await handleTranscribe(audioRequest(), deps({ rateLimitFn: rateLimitFn as never }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7");
    expect(rateLimitFn).toHaveBeenCalledTimes(1);
  });

  it("uses its own bucket, not the chat one", async () => {
    const rateLimitFn = vi.fn(async (_key: string, _limit: number, _windowMs: number) => ({ allowed: true, retryAfterSeconds: 0 }));
    await handleTranscribe(audioRequest(), deps({ rateLimitFn: rateLimitFn as never }));
    const keys = rateLimitFn.mock.calls.map((c) => c[0] as string);
    expect(keys).toEqual(["transcribe:minute:user:u1", "transcribe:day:user:u1"]);
    expect(keys.some((k) => k.startsWith("chat:"))).toBe(false);
  });

  it("503s when no speech provider is configured, without reading the body", async () => {
    const transcribeFn = vi.fn();
    const res = await handleTranscribe(audioRequest(), deps({
      getSettingsFn: (async () => ({ ...SETTINGS, speechProvider: "ollama" })) as never,
      transcribeFn: transcribeFn as never,
    }));
    expect(res.status).toBe(503);
    expect(transcribeFn).not.toHaveBeenCalled();

    // The assertions above only prove transcribeFn is unreached, which would
    // also be true if the capability check ran AFTER request.formData() but
    // before the audio-field check — that ordering still never calls
    // transcribeFn. A request with no body at all is what actually tells the
    // two orderings apart: calling request.formData() on it throws (no
    // Content-Type), which the handler's own try/catch turns into a 400. So
    // 503 here is only possible if the capability check runs BEFORE the body
    // is ever read.
    const bodylessRes = await handleTranscribe(
      new Request("http://localhost/api/chat/transcribe", { method: "POST" }),
      deps({
        getSettingsFn: (async () => ({ ...SETTINGS, speechProvider: "ollama" })) as never,
        transcribeFn: transcribeFn as never,
      }),
    );
    expect(bodylessRes.status).toBe(503);
  });

  it("400s when the audio field is missing", async () => {
    const res = await handleTranscribe(audioRequest({ field: "file" }), deps());
    expect(res.status).toBe(400);
  });

  it("413s a recording over the size cap", async () => {
    const res = await handleTranscribe(audioRequest({ bytes: 11 * 1024 * 1024 }), deps());
    expect(res.status).toBe(413);
  });

  it("415s an unsupported container", async () => {
    const res = await handleTranscribe(audioRequest({ type: "video/mp4" }), deps());
    expect(res.status).toBe(415);
  });

  it("passes the base mime type, not the raw one, to the provider", async () => {
    const transcribeFn = vi.fn(async (_audio: Uint8Array, _mimeType: string) => "ok");
    await handleTranscribe(audioRequest({ type: "audio/webm;codecs=opus" }), deps({ transcribeFn: transcribeFn as never }));
    expect(transcribeFn.mock.calls[0][1]).toBe("audio/webm");
  });

  it("502s a provider failure with the provider's message", async () => {
    const res = await handleTranscribe(audioRequest(), deps({
      transcribeFn: (async () => { throw new MissingProviderKeyError("Transcription", "google"); }) as never,
    }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/no API key/i);
  });

  it("returns the transcript", async () => {
    const res = await handleTranscribe(audioRequest(), deps());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello there" });
  });

  it("returns 200 with an empty transcript when nothing was heard", async () => {
    // Silence is a successful request. Turning it into an error would make the
    // client show a failure for something the user did on purpose.
    const res = await handleTranscribe(audioRequest(), deps({ transcribeFn: (async () => "") as never }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "" });
  });
});

describe("transcribeAvailability", () => {
  it("401s when not signed in", async () => {
    const res = await transcribeAvailability(new Request("http://localhost/api/chat/transcribe"), deps({
      getSession: (async () => { throw new UnauthorizedError(); }) as never,
    }));
    expect(res.status).toBe(401);
  });

  it("reports available for a keyed, capable provider", async () => {
    const res = await transcribeAvailability(new Request("http://localhost/api/chat/transcribe"), deps());
    expect(await res.json()).toEqual({ available: true });
  });

  it("reports unavailable when the key is missing", async () => {
    const res = await transcribeAvailability(new Request("http://localhost/api/chat/transcribe"), deps({
      getSettingsFn: (async () => ({ ...SETTINGS, keys: { google: null, openai: null, anthropic: null } })) as never,
    }));
    expect(await res.json()).toEqual({ available: false });
  });
});
