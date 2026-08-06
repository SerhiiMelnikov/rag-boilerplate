import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getAuthUserById } from "@/lib/auth/users";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { consume } from "@/lib/ratelimit/store";
import { transcribe, isTranscribeConfigured } from "@/lib/providers/transcription";
import { isProviderError } from "@/lib/providers/types";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// A 60-second opus recording is well under a megabyte, so this only ever
// catches something that did not come from our own recorder.
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

// What MediaRecorder produces across the browsers we support, plus the two
// plain containers a programmatic client is likely to send.
export const ALLOWED_AUDIO_MIME = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"];

// "audio/webm;codecs=opus" -> "audio/webm". MediaRecorder always reports the
// codec parameter and no provider wants to see it.
//
// This lives here rather than in src/lib/voice/mime.ts because src/lib/voice is
// deleted from api-only builds while this handler ships in them.
export function baseMimeType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}

type SessionFn = (request: Request) => Promise<{ id?: string; role?: string } | null>;

export interface TranscribeDeps {
  getSession?: SessionFn;
  getAuthUser?: typeof getAuthUserById;
  getSettingsFn?: typeof getRuntimeSettings;
  rateLimitFn?: typeof consume;
  transcribeFn?: typeof transcribe;
}

async function authenticate(request: Request, deps: TranscribeDeps) {
  // Cast through unknown: our SessionFn is narrower than requireUser's GuardDeps
  // (it omits role/isSuperAdmin as required fields) but satisfies the runtime
  // contract used here (requireUser only reads session.id off the result) —
  // mirrors the same cast in src/api/chat/handler.ts.
  return requireUser(request, {
    getSession: deps.getSession,
    getAuthUser: deps.getAuthUser,
  } as unknown as NonNullable<Parameters<typeof requireUser>[1]>);
}

// GET: whether a transcription request could be served right now. The
// microphone renders on this and nothing else — a build-time catalog flag would
// only say the project SHIPS a capable provider, not that an admin selected one
// and pasted a key, and a button that flips nothing is worse than no button.
export async function transcribeAvailability(request: Request, deps: TranscribeDeps = {}) {
  try {
    await authenticate(request, deps);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const settings = await (deps.getSettingsFn ?? getRuntimeSettings)();
  return Response.json({ available: isTranscribeConfigured(settings) });
}

export async function handleTranscribe(request: Request, deps: TranscribeDeps = {}) {
  const getSettingsFn = deps.getSettingsFn ?? getRuntimeSettings;
  const rateLimitFn = deps.rateLimitFn ?? consume;
  const transcribeFn = deps.transcribeFn ?? transcribe;

  let user;
  try {
    user = await authenticate(request, deps);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  // Its own bucket, and before any parsing: this is a new paid path, and a
  // limit that runs after the expensive part is not a limit. The minute rule
  // short-circuits so a request it already rejected does not also burn a slot
  // of the daily quota.
  const settings = await getSettingsFn();
  for (const [rule, limit, windowMs] of [
    ["minute", settings.transcribeRateLimitPerMinute, MINUTE_MS],
    ["day", settings.transcribeRateLimitPerDay, DAY_MS],
  ] as const) {
    const verdict = await rateLimitFn(`transcribe:${rule}:user:${user.id}`, limit, windowMs);
    if (!verdict.allowed) {
      return Response.json(
        { error: `You have reached the voice limit. Try again in ${verdict.retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
  }

  // Before reading the body: there is no point buffering ten megabytes for a
  // request that cannot be served.
  if (!isTranscribeConfigured(settings)) {
    return Response.json({ error: "Voice input is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("audio");
  if (!(file instanceof File)) {
    return Response.json({ error: "audio is required" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "That recording is too long." }, { status: 413 });
  }
  const mimeType = baseMimeType(file.type);
  if (!ALLOWED_AUDIO_MIME.includes(mimeType)) {
    return Response.json({ error: `Unsupported audio format: ${mimeType || "unknown"}` }, { status: 415 });
  }

  try {
    const text = await transcribeFn(new Uint8Array(await file.arrayBuffer()), mimeType, settings);
    // An empty transcript is a SUCCESS: the user recorded silence. The client
    // decides not to send it. Reporting it as an error here would show a
    // failure for something done on purpose.
    return Response.json({ text });
  } catch (err) {
    if (isProviderError(err)) return Response.json({ error: (err as Error).message }, { status: 502 });
    throw err;
  }
}
