import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { MissingProviderKeyError } from "./types";

const transcribeSpy = vi.fn();
const generateTextSpy = vi.fn();
const generateObjectSpy = vi.fn();

vi.mock("ai", () => ({
  experimental_transcribe: (args: unknown) => transcribeSpy(args),
  generateText: (args: unknown) => generateTextSpy(args),
  generateObject: (args: unknown) => generateObjectSpy(args),
}));

// The adapters are mocked too: this file tests the routing and the shape of the
// call, not the SDK. Reaching the network here would make the test a liability.
vi.mock("./openai", () => ({ openaiTranscription: (key: string, model: string) => ({ key, model }) }));
vi.mock("./google", () => ({ googleChat: (key: string, model: string) => ({ key, model }) }));

const { transcribe, isTranscribeConfigured, TRANSCRIBE_PROMPT } = await import("./transcription");

const AUDIO = new Uint8Array([1, 2, 3]);

function settings(over: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    speechProvider: "google",
    speechModel: "gemini-2.5-flash",
    keys: { google: "g-key", openai: "o-key", anthropic: null },
    ...over,
  } as RuntimeSettings;
}

beforeEach(() => {
  transcribeSpy.mockReset();
  generateTextSpy.mockReset();
  generateObjectSpy.mockReset();
});

describe("transcribe", () => {
  it("routes openai through the transcription model and returns the trimmed text", async () => {
    transcribeSpy.mockResolvedValue({ text: "  hello there  " });
    const out = await transcribe(AUDIO, "audio/webm", settings({ speechProvider: "openai", speechModel: "gpt-4o-mini-transcribe" }));
    expect(out).toBe("hello there");
    expect(transcribeSpy).toHaveBeenCalledTimes(1);
    const arg = transcribeSpy.mock.calls[0][0] as { model: { key: string; model: string }; audio: Uint8Array };
    expect(arg.model).toEqual({ key: "o-key", model: "gpt-4o-mini-transcribe" });
    expect(arg.audio).toBe(AUDIO);
    expect(generateTextSpy).not.toHaveBeenCalled();
  });

  it("passes the recorded mime type through rather than a fixed one", async () => {
    generateObjectSpy.mockResolvedValue({ object: { hasSpeech: true, transcript: "x" } });
    await transcribe(AUDIO, "audio/mp4", settings());
    const arg = generateObjectSpy.mock.calls[0][0] as { messages: Array<{ content: Array<{ mimeType?: string }> }> };
    expect(arg.messages[0].content[0].mimeType).toBe("audio/mp4");
  });

  it("raises MissingProviderKeyError when the selected provider has no key", async () => {
    await expect(
      transcribe(AUDIO, "audio/webm", settings({ keys: { google: null, openai: null, anthropic: null } })),
    ).rejects.toBeInstanceOf(MissingProviderKeyError);
    expect(generateObjectSpy).not.toHaveBeenCalled();
  });

  it("throws rather than falling through for a provider that cannot transcribe", async () => {
    await expect(transcribe(AUDIO, "audio/webm", settings({ speechProvider: "ollama" }))).rejects.toThrow(/cannot transcribe/i);
  });
});

describe("google returns a structured result", () => {
  it("routes google through generateObject with the audio as a file part", async () => {
    generateObjectSpy.mockResolvedValue({ object: { hasSpeech: true, transcript: "  привіт  " } });
    const out = await transcribe(AUDIO, "audio/webm", settings());
    expect(out).toBe("привіт");
    expect(transcribeSpy).not.toHaveBeenCalled();
    // generateText must not be reached at all: a fallback to free text would
    // reintroduce the whole string-matching problem behind a second code path.
    expect(generateTextSpy).not.toHaveBeenCalled();

    const arg = generateObjectSpy.mock.calls[0][0] as {
      model: { key: string; model: string };
      schema: { shape: Record<string, unknown> };
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
    };
    expect(arg.model).toEqual({ key: "g-key", model: "gemini-2.5-flash" });
    // Tighter than toBeDefined(), which z.object({}) would also satisfy: pins
    // the actual field NAMES asked of the model. The mock fixtures elsewhere in
    // this file supply hasSpeech/transcript regardless of what the real schema
    // requires, so only this check can catch a field being renamed.
    expect(Object.keys(arg.schema.shape).sort()).toEqual(["hasSpeech", "transcript"]);
    const parts = arg.messages[0].content;
    // The file part must come first and carry both the data and the mime type
    // through unaltered: Gemini reads it as inlineData.mimeType, and that is
    // the whole reason audio/webm works at all.
    expect(parts[0]).toEqual({ type: "file", data: AUDIO, mimeType: "audio/webm" });
    expect(parts[1]).toEqual({ type: "text", text: TRANSCRIBE_PROMPT });
    // The equality check above pins the exact text sent, but TRANSCRIBE_PROMPT
    // is the very constant it is composed from -- editing a clause OUT of that
    // constant would not be caught by comparing it to itself, since both sides
    // would silently agree on the same, weakened text. The timestamp and
    // speaker-label clauses are called out as load-bearing in the file-level
    // comment (measured from a 440 Hz tone coming back as a WebVTT-shaped
    // reply), so they are pinned here as their own literal checks too.
    const promptText = String((parts[1] as { text: string }).text);
    expect(promptText).toMatch(/verbatim/i);
    expect(promptText).toMatch(/no preamble/i);
    expect(promptText).toMatch(/timestamps/i);
    expect(promptText).toMatch(/speaker labels/i);
  });

  it("returns nothing when the model reports no speech", async () => {
    // A model that honours the schema now has a correct place for a refusal
    // (hasSpeech: false) instead of prose this file has to pattern-match. That
    // is conditional on compliance: nothing stops a model setting hasSpeech:
    // true and writing this exact sentence into transcript instead, and
    // looksLikeEcho does not catch it (it only matches the instruction being
    // echoed back, not an unrelated refusal) -- see "still catches an
    // instruction echo placed INSIDE the transcript field" below for what
    // looksLikeEcho actually does catch.
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: false, transcript: "I'm sorry, but I cannot fulfill this request." },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("trims the transcript field", async () => {
    // Named for what it can actually detect. An earlier draft of this plan called it
    // "returns nothing when the transcript is empty" -- but `looksLikeEcho("")` is
    // false and `"   ".trim()` is `""`, so that outcome arrives on its own under
    // every implementation and the test could not fail. What it really pins is the
    // .trim(), so the fixture carries surrounding whitespace AND content.
    generateObjectSpy.mockResolvedValue({ object: { hasSpeech: true, transcript: "  де рахунок  " } });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("де рахунок");
  });

  it("still catches an instruction echo placed INSIDE the transcript field", async () => {
    // Structured output moves this guard, it does not retire it: nothing stops a
    // model writing the instruction into the field it was told to fill.
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: true, transcript: "Transcribe this audio verbatim. Output only the transcript." },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("fails rather than falling back when the structured call throws", async () => {
    generateObjectSpy.mockRejectedValue(new Error("schema unsupported"));
    await expect(transcribe(AUDIO, "audio/webm", settings())).rejects.toThrow();
    expect(generateTextSpy).not.toHaveBeenCalled();
  });
});

// The sentinel machinery (NO_SPEECH_SENTINEL / NO_SPEECH_CLAUSE / NO_SPEECH_PATTERN
// / NO_SPEECH_MAX_LEN) that used to recognise "no speech" in free prose is gone —
// `hasSpeech` above is that answer now, as a boolean, so there is nothing left in
// this file for a NO_SPEECH-shaped regex to match against. What remains testable
// is `looksLikeEcho` itself, now fed from the structured transcript field instead
// of raw model prose.
describe("a prompt echo is not a transcript", () => {
  it("drops the instruction when Gemini echoes it back", async () => {
    // This is the exact string a real user saw posted as their own question,
    // back when it arrived as free prose rather than a structured field.
    generateObjectSpy.mockResolvedValue({
      object: {
        hasSpeech: true,
        transcript:
          "Transcribe this audio verbatim. Output only the transcript, with no preamble, commentary or translation. If the audio contains no discernible speech, reply with exactly: NO_SPEECH",
      },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("drops the echo whatever the casing and spacing", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: true, transcript: "  transcribe this audio verbatim.   output only the transcript,  " },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("drops a short echo that stops after the instruction's first sentence", async () => {
    // A truncated echo need not run all the way to the anchor's end to be
    // identifiable as one: "Transcribe this audio verbatim." is a complete
    // clause and an exact, character-for-character prefix of the
    // instruction — not a coincidence a real, unrelated utterance would
    // produce.
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: true, transcript: "Transcribe this audio verbatim." },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("does NOT drop a real sentence that merely quotes the instruction mid-thought", async () => {
    // Pins prefix semantics as distinct from substring semantics: this reply
    // contains the instruction's exact wording, just not at its start, so an
    // opening-anchored prefix match must leave it alone even though a
    // substring match would not.
    generateObjectSpy.mockResolvedValue({
      object: {
        hasSpeech: true,
        transcript: "I need you to transcribe this audio verbatim. Output only the transcript, please.",
      },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe(
      "I need you to transcribe this audio verbatim. Output only the transcript, please.",
    );
  });

  it("does NOT drop a real transcript that happens to talk about transcription", async () => {
    // The guard must be narrow. Someone asking about this very feature is a
    // legitimate question, and eating it would be a worse bug than the one the
    // guard exists to stop.
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: true, transcript: "How do I transcribe an audio file with this app?" },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("How do I transcribe an audio file with this app?");
  });

  it("does NOT drop a real transcript that merely contains the word transcript", async () => {
    generateObjectSpy.mockResolvedValue({
      object: { hasSpeech: true, transcript: "Show me the transcript of yesterday's meeting." },
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("Show me the transcript of yesterday's meeting.");
  });

  // --- Whisper's own silence failure mode (the openai branch) ----------------
  //
  // Whisper never sees TRANSCRIBE_PROMPT and cannot echo it, so none of the
  // guards above reach this provider — the one a `--providers openai` scaffold
  // gets by default. Handed audio with no speech in it, it hallucinates a stock
  // phrase from its training data, and the caller's 300 ms energy floor does not
  // stop a cough or a door slam from getting that far.
  const OPENAI = { speechProvider: "openai", speechModel: "gpt-4o-mini-transcribe" };

  it.each([
    "Thank you.",
    "Thanks for watching!",
    "Thank you for watching.",
    "Subtitles by the Amara.org community",
    "you",
  ])("maps Whisper's silence hallucination %j to an empty string", async (phrase) => {
    transcribeSpy.mockResolvedValue({ text: phrase });
    expect(await transcribe(AUDIO, "audio/webm", settings(OPENAI))).toBe("");
  });

  it("does NOT drop a real Whisper transcript that merely contains a listed phrase", async () => {
    // Exact-match, not fuzzy: the list is short precisely so it can stay whole
    // -string. Anything that merely contains one of these is a real utterance.
    const real = "Thank you for the summary, can you also list the sources?";
    transcribeSpy.mockResolvedValue({ text: real });
    expect(await transcribe(AUDIO, "audio/webm", settings(OPENAI))).toBe(real);
  });

  it("leaves the Whisper denylist off the google branch", async () => {
    // Gemini reports hasSpeech itself; it has no reason to produce Whisper's
    // caption artifacts, and a real spoken "thank you" on that path should
    // reach the chat like any other utterance. Pins the two backstops as
    // per-provider rather than shared.
    generateObjectSpy.mockResolvedValue({ object: { hasSpeech: true, transcript: "Thank you." } });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("Thank you.");
  });
});

describe("isTranscribeConfigured", () => {
  it("is true for a keyed, speech-capable provider with a model", () => {
    expect(isTranscribeConfigured(settings())).toBe(true);
  });

  it("is false when the provider cannot transcribe", () => {
    expect(isTranscribeConfigured(settings({ speechProvider: "anthropic" }))).toBe(false);
  });

  it("is false when the key is missing", () => {
    expect(isTranscribeConfigured(settings({ keys: { google: null, openai: "o", anthropic: null } }))).toBe(false);
  });

  it("is false when the model is blank", () => {
    expect(isTranscribeConfigured(settings({ speechModel: "   " }))).toBe(false);
  });
});
