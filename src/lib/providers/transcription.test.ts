import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { MissingProviderKeyError } from "./types";

const transcribeSpy = vi.fn();
const generateTextSpy = vi.fn();

vi.mock("ai", () => ({
  experimental_transcribe: (args: unknown) => transcribeSpy(args),
  generateText: (args: unknown) => generateTextSpy(args),
}));

// The adapters are mocked too: this file tests the routing and the shape of the
// call, not the SDK. Reaching the network here would make the test a liability.
vi.mock("./openai", () => ({ openaiTranscription: (key: string, model: string) => ({ key, model }) }));
vi.mock("./google", () => ({ googleChat: (key: string, model: string) => ({ key, model }) }));

const { transcribe, isTranscribeConfigured } = await import("./transcription");

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

  it("routes google through generateText with the audio as a file part", async () => {
    generateTextSpy.mockResolvedValue({ text: "  привіт  " });
    const out = await transcribe(AUDIO, "audio/webm", settings());
    expect(out).toBe("привіт");
    expect(transcribeSpy).not.toHaveBeenCalled();
    const arg = generateTextSpy.mock.calls[0][0] as {
      model: { key: string; model: string };
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
    };
    expect(arg.model).toEqual({ key: "g-key", model: "gemini-2.5-flash" });
    const parts = arg.messages[0].content;
    // The file part must come first and carry the mime type through unaltered:
    // Gemini reads it as inlineData.mimeType, and that is the whole reason
    // audio/webm works at all.
    expect(parts[0]).toEqual({ type: "file", data: AUDIO, mimeType: "audio/webm" });
    expect(parts[1].type).toBe("text");
    expect(String(parts[1].text)).toMatch(/verbatim/i);
    // The escape hatch is its own clause, not just "the prompt mentions
    // verbatim somewhere" — deleting it must be visible to this test.
    expect(String(parts[1].text)).toMatch(/NO_SPEECH/);
  });

  it("passes the recorded mime type through rather than a fixed one", async () => {
    generateTextSpy.mockResolvedValue({ text: "x" });
    await transcribe(AUDIO, "audio/mp4", settings());
    const arg = generateTextSpy.mock.calls[0][0] as { messages: Array<{ content: Array<{ mimeType?: string }> }> };
    expect(arg.messages[0].content[0].mimeType).toBe("audio/mp4");
  });

  it("returns an empty string when the provider heard nothing", async () => {
    generateTextSpy.mockResolvedValue({ text: "   " });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("raises MissingProviderKeyError when the selected provider has no key", async () => {
    await expect(
      transcribe(AUDIO, "audio/webm", settings({ keys: { google: null, openai: null, anthropic: null } })),
    ).rejects.toBeInstanceOf(MissingProviderKeyError);
    expect(generateTextSpy).not.toHaveBeenCalled();
  });

  it("throws rather than falling through for a provider that cannot transcribe", async () => {
    await expect(transcribe(AUDIO, "audio/webm", settings({ speechProvider: "ollama" }))).rejects.toThrow(/cannot transcribe/i);
  });
});

describe("a prompt echo is not a transcript", () => {
  it("drops the instruction when Gemini echoes it back", async () => {
    // This is the exact string a real user saw posted as their own question.
    generateTextSpy.mockResolvedValue({
      text: "Transcribe this audio verbatim. Output only the transcript, with no preamble, commentary or translation. If the audio contains no discernible speech, reply with exactly: NO_SPEECH",
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("drops a partial echo of the instruction", async () => {
    generateTextSpy.mockResolvedValue({ text: "Transcribe this audio verbatim. Output only the transcript." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("drops the echo whatever the casing and spacing", async () => {
    generateTextSpy.mockResolvedValue({ text: "  transcribe this audio verbatim.   output only the transcript,  " });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps the no-speech sentinel to an empty string", async () => {
    generateTextSpy.mockResolvedValue({ text: "NO_SPEECH" });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps the sentinel to an empty string with a trailing full stop", async () => {
    // A cough or a door slam clears the Layer 1 energy gate while containing
    // no discernible speech, which is exactly when the model is asked to
    // emit the sentinel — and a model asked for one fixed word still
    // punctuates it like a sentence often enough that an exact match alone
    // would repeat the shipped bug on this path.
    generateTextSpy.mockResolvedValue({ text: "NO_SPEECH." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps a backtick-fenced sentinel to an empty string", async () => {
    // Models fence single-token answers constantly.
    generateTextSpy.mockResolvedValue({ text: "`NO_SPEECH`" });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps the paraphrased two-word sentinel to an empty string", async () => {
    // A model told to reply with the bare token "NO_SPEECH" frequently
    // paraphrases it as the two plain words instead — this is deliberate, not
    // an accident of the character class, and must keep working.
    generateTextSpy.mockResolvedValue({ text: "No speech" });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps the paraphrased sentinel to an empty string with a trailing full stop", async () => {
    generateTextSpy.mockResolvedValue({ text: "No speech." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("does NOT drop a real sentence that merely contains the words no speech", async () => {
    // Pins the end anchor: the sentinel pattern matches the WHOLE reply, not
    // a substring of it, so a genuine sentence that happens to contain "no
    // speech" partway through is left alone.
    generateTextSpy.mockResolvedValue({ text: "No speech was detected in the recording." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("No speech was detected in the recording.");
  });

  it("drops a short echo that stops after the instruction's first sentence", async () => {
    // A truncated echo need not run all the way to the anchor's end to be
    // identifiable as one: "Transcribe this audio verbatim." is a complete
    // clause and an exact, character-for-character prefix of the
    // instruction — not a coincidence a real, unrelated utterance would
    // produce.
    generateTextSpy.mockResolvedValue({ text: "Transcribe this audio verbatim." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("does NOT drop a real sentence that merely quotes the instruction mid-thought", async () => {
    // Pins prefix semantics as distinct from substring semantics: this reply
    // contains the instruction's exact wording, just not at its start, so an
    // opening-anchored prefix match must leave it alone even though a
    // substring match would not.
    generateTextSpy.mockResolvedValue({
      text: "I need you to transcribe this audio verbatim. Output only the transcript, please.",
    });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe(
      "I need you to transcribe this audio verbatim. Output only the transcript, please.",
    );
  });

  it("does NOT drop a real transcript that happens to talk about transcription", async () => {
    // The guard must be narrow. Someone asking about this very feature is a
    // legitimate question, and eating it would be a worse bug than the one the
    // guard exists to stop.
    generateTextSpy.mockResolvedValue({ text: "How do I transcribe an audio file with this app?" });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("How do I transcribe an audio file with this app?");
  });

  it("does NOT drop a real transcript that merely contains the word transcript", async () => {
    generateTextSpy.mockResolvedValue({ text: "Show me the transcript of yesterday's meeting." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("Show me the transcript of yesterday's meeting.");
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
