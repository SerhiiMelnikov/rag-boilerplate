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

// The task-8 brief assumed a helper named transcribeWithGoogleReplying already
// existed in this file. It did not -- the existing tests below all inline the
// same three lines (mock generateText's reply, call transcribe with the default
// google settings, assert on the result), so this helper is added here to name
// that pattern rather than to introduce a new one. It goes through the real
// transcribe() function, same as every other test in this file; nothing here
// bypasses the code under test.
async function transcribeWithGoogleReplying(replyText: string): Promise<string> {
  generateTextSpy.mockResolvedValue({ text: replyText });
  return transcribe(AUDIO, "audio/webm", settings());
}

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

  it("maps a sentinel that explains itself to an empty string", async () => {
    // A model told to reply with a bare token explains itself about as often as
    // it paraphrases. This form matched NEITHER the old end-anchored sentinel
    // pattern NOR either echo direction (both anchored on the instruction's
    // opening), so it posted to the chat as the user's own question — the
    // shipped bug's exact shape, on a path the fix for it did not reach.
    generateTextSpy.mockResolvedValue({ text: "NO_SPEECH — the audio contains only background noise" });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("maps the paraphrased sentinel that explains itself to an empty string", async () => {
    generateTextSpy.mockResolvedValue({ text: "No speech was detected in the recording." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("");
  });

  it("does NOT drop a real sentence that merely contains the words no speech", async () => {
    // What the OPENING anchor protects, now that the closing one is gone: a
    // genuine question that mentions no-speech partway through does not begin
    // the way the sentinel does, so a prefix match cannot reach it — however
    // short it is.
    const real = "There is no speech in the second recording, can you check?";
    generateTextSpy.mockResolvedValue({ text: real });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe(real);
  });

  it("does NOT drop a long transcript that happens to open with the words no speech", async () => {
    // What the LENGTH CAP protects, now that the opening anchor alone would
    // otherwise reach this. The cap is NO_SPEECH_CLAUSE's own length — the
    // escape hatch the model is paraphrasing when it explains itself — and past
    // it, prose is the likelier reading than a sentinel.
    const real =
      "No speech is allowed in the reading room after eight, according to the library handbook we uploaded last week.";
    generateTextSpy.mockResolvedValue({ text: real });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe(real);
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
    // Gemini is instructed and answers with the sentinel; it has no reason to
    // produce Whisper's caption artifacts, and a real spoken "thank you" on that
    // path should reach the chat like any other utterance. Pins the two backstops
    // as per-provider rather than shared.
    generateTextSpy.mockResolvedValue({ text: "Thank you." });
    expect(await transcribe(AUDIO, "audio/webm", settings())).toBe("Thank you.");
  });
});

describe("preface stripping (google branch)", () => {
  it("drops a conversational preamble and keeps the transcript", async () => {
    await expect(transcribeWithGoogleReplying("Sure, here's the transcript: where is the invoice"))
      .resolves.toBe("where is the invoice");
  });

  it("keeps a transcript whose own first sentence ends in a colon", async () => {
    // A real utterance can contain a colon, and this one's arrives at character 36 --
    // not meaningfully later than "Sure, here's the transcript" (27) is long, so a
    // length cap alone could not separate the two either way. What actually saves
    // this sentence is that its lead does not OPEN with an acknowledgement phrase
    // ("I need the following...") -- see the opener-anchor tests below for the
    // condition that is really doing the work here.
    const spoken = "I need the following from the report: revenue, headcount and the churn number";
    await expect(transcribeWithGoogleReplying(spoken)).resolves.toBe(spoken);
  });

  it("keeps a preface that never mentions a transcript", async () => {
    // Deliberate non-goal, not a gap: "Sure, here you go:" opens with a recognised
    // acknowledgement but never names the vocabulary word, so it is left alone.
    // Catching it would mean dropping the vocabulary condition, which is what
    // keeps the guard from reaching ordinary "sure, ..." sentences generally.
    const reply = "Sure, here you go: where is the invoice";
    await expect(transcribeWithGoogleReplying(reply)).resolves.toBe(reply);
  });

  it("keeps a reply that is nothing but a preface, since stripping would empty it", async () => {
    // Nothing followed the colon, so there is no transcript to recover. Returning
    // the text unchanged leaves the existing empty/echo handling in charge rather
    // than inventing an empty result here.
    const only = "Here is the transcript:";
    await expect(transcribeWithGoogleReplying(only)).resolves.toBe(only);
  });

  it("keeps a short real utterance with a colon and no transcript vocabulary", async () => {
    // Deliberately exercises the same "no keyword" condition as the "never
    // mentions a transcript" case above, but on an ordinary dictated note rather
    // than a reply shaped like a machine preamble -- pinned separately because the
    // two literal shapes are different enough that a regression in one would not
    // necessarily be caught by the other.
    const spoken = "note to self: buy milk";
    await expect(transcribeWithGoogleReplying(spoken)).resolves.toBe(spoken);
  });

  // Falsifying PREFACE_MAX_LEN against the five cases above alone produces no
  // failure: opener-anchoring already rules every one of them out before length
  // is even checked. That does not make the length bound decorative -- this is
  // the case it actually exists for. A spoken message can plausibly open with an
  // acknowledgement, ramble for a while, and only then reach its real point: this
  // one opens with "Sure" and names "transcript" (both conditions the opener/
  // vocabulary anchors alone would accept), but its lead runs to 113 normalised
  // characters, well past PREFACE_MAX_LEN (58) -- without the cap this is wrongly
  // truncated down to its tail, discarding the real content in between.
  it("keeps a rambling real reply that opens with an acknowledgement and names the transcript, but is too long to be one", async () => {
    const reply =
      "Sure, so basically what happened was we were going over the transcript from yesterday's " +
      "call and there's an issue: can you check the timestamp around minute five";
    await expect(transcribeWithGoogleReplying(reply)).resolves.toBe(reply);
  });

  // --- The "damage table": sentences a vocabulary search with no start-anchor
  // would have wrongly treated as preambles, because in speech a colon
  // overwhelmingly introduces a timestamp or a ratio, and the sentence carrying
  // it is exactly where a user of a transcription feature says "transcript" out
  // loud. None of these opens with a recognised acknowledgement phrase, so the
  // opener anchor leaves all of them alone regardless of what they contain.
  it.each([
    "Show me the part of the transcript at 12:45",
    "Find where the transcript mentions a ratio of 3:1",
    "Can you find the transcript from the meeting at 3:30 yesterday",
    "Read me the transcript line starting at 00:15",
    "Send me the transcript: I need it by Friday",
    "Question about the transcription: does it support Ukrainian",
    "About the transcript: where do I download it",
    'The transcript says: "hello world"',
  ])("keeps the real question %j untouched", async (spoken) => {
    await expect(transcribeWithGoogleReplying(spoken)).resolves.toBe(spoken);
  });

  // --- Regression coverage for the NO_SPEECH-escape fix. These two replies are
  // the ones the earlier, pre-opener-anchor version of this guard was shown to
  // wrongly strip (its lead names "transcript" and sits under the length cap,
  // and that version had no opener requirement to stop it). With the opener
  // anchor in place, neither lead opens with a PREFACE_OPENERS phrase
  // ("no speech..." isn't one), so stripPreface leaves both untouched and the
  // pre-existing sentinel matcher (unaffected by this task) catches them, same
  // as before this guard existed at all.
  it("drops a self-explaining NO_SPEECH reply that names the transcript before its colon", async () => {
    await expect(transcribeWithGoogleReplying("No speech detected in this transcript: only background noise."))
      .resolves.toBe("");
  });

  it("drops a second phrasing of a self-explaining NO_SPEECH reply", async () => {
    await expect(transcribeWithGoogleReplying("No speech in the transcript: the audio is silent."))
      .resolves.toBe("");
  });

  it("drops an echo that inserts a colon where the instruction's own text continues", async () => {
    // The lead here ("Transcribe this audio verbatim. Output only the
    // transcript") does not open with any PREFACE_OPENERS phrase, so
    // stripPreface never touches it -- deprefaced equals trimmed, and
    // looksLikeEcho's own character-for-character prefix match against
    // ECHO_ANCHOR is what drops it, same as the pre-existing echo tests above.
    // Pinned separately to confirm splicing a colon into the middle of the
    // echoed instruction does not accidentally open a path through stripPreface.
    await expect(
      transcribeWithGoogleReplying("Transcribe this audio verbatim. Output only the transcript: where is the invoice"),
    ).resolves.toBe("");
  });

  it("drops the sentinel when it is hidden behind a benign acknowledgement", async () => {
    // This is the one case in the file where checking trimmed alone would NOT be
    // enough: "here is the transcript..." does not start like the sentinel or
    // the instruction, so only the DE-PREFACED text ("NO_SPEECH", once the
    // acknowledgement is stripped) is recognisable as fabricated. Checking
    // deprefaced is what catches this; see the comment above stripPreface's call
    // site for why checking trimmed as well is currently just insurance, not
    // load-bearing for this particular case.
    await expect(transcribeWithGoogleReplying("Here is the transcript: NO_SPEECH")).resolves.toBe("");
  });

  it("leaves a Ukrainian preamble of the identical shape untouched, by decision", async () => {
    // Documents a known, deliberate limit rather than a defect: PREFACE_OPENERS
    // and PREFACE_KEYWORD are English-only, so a Ukrainian preamble of the exact
    // shape this guard targets is not recognised. Passing it through unchanged is
    // the safe direction for this guard to be wrong in -- the same default every
    // other case above falls back to.
    const reply = "Звичайно, ось транскрипт: де рахунок";
    await expect(transcribeWithGoogleReplying(reply)).resolves.toBe(reply);
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
