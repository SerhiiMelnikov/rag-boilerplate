import { experimental_transcribe, generateObject } from "ai";
import { z } from "zod";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { SPEECH_PROVIDER_IDS, keyNameOf } from "@/lib/providers/catalog";
import { MissingProviderKeyError, toProviderError } from "./types";
import { openaiTranscription } from "./openai";
import { googleChat } from "./google";

// Gemini has no transcription model, so it is asked to transcribe through the
// ordinary chat model. Unlike the openai branch, that means the reply is whatever
// a chat model decides to say — which is why this path asks for a STRUCTURED
// result rather than prose. `hasSpeech` gives a model that honours the schema a
// correct place to put "there was nothing to transcribe", and for such a model
// removes the free-text sentinel-matching path entirely: before this, silence
// produced "I'm sorry, but I cannot fulfill this request…" and it posted to the
// chat as the user's own question. The schema is a contract, not a guarantee,
// though: nothing stops a model setting hasSpeech: true and writing refusal
// prose — or the measured WebVTT case below — into transcript anyway. The
// prompt's own wording is the only remaining mitigation for that; looksLikeEcho
// (below) only catches the model echoing this INSTRUCTION back, not an
// unrelated refusal or a mistaken transcript shape.
//
// ECHO_ANCHOR_TEXT is still spliced INTO the prompt rather than duplicated beside
// it, so the wording and the echo matcher below can never drift apart: there is
// one place that spells out how the instruction begins.
//
// The timestamp and speaker-label clauses are load-bearing and were added from a
// measurement, not a guess: a 440 Hz tone reproducibly came back as
// "00:00:00:000 --> 00:00:02:000\nHello." A structured field will accept that
// text just as happily as free prose would, so the prompt has to forbid it —
// and that prohibition, not a code-level check, is what stands between a
// non-compliant reply and the chat.
const ECHO_ANCHOR_TEXT = "Transcribe this audio verbatim. Output only the transcript";
// Exported so the routing test can pin the exact text sent, not just that some
// text was sent — see that test for why an equality check on this constant is
// combined with, and not a substitute for, independent checks on its clauses.
export const TRANSCRIBE_PROMPT =
  `${ECHO_ANCHOR_TEXT}, with no preamble, commentary, translation, timestamps or ` +
  `speaker labels. Set hasSpeech to false when the audio contains no human speech — ` +
  `silence, a tone, music, background noise, a cough or a door slam all count as no ` +
  `speech — and leave transcript empty.`;

// What the model must return. A model that honours this schema now has a
// dedicated place for "no speech" (hasSpeech) instead of a sentence this file
// used to match with regexes — but the schema only constrains the TYPES, not
// the CONTENT: a model can still set hasSpeech: true and write refusal prose, a
// timestamped transcript, or an echo of the instruction into `transcript`.
// Those shapes are off-contract, not unrepresentable; the prompt's wording
// above, and looksLikeEcho below for the echo case specifically, are what is
// left to catch them.
const TranscriptionResult = z.object({
  hasSpeech: z.boolean(),
  transcript: z.string(),
});

function speechKey(s: RuntimeSettings): string | null {
  const name = keyNameOf(s.speechProvider);
  return name ? s.keys[name] : null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Normalised, with no trailing punctuation — the anchor an echo is matched
// against below.
const ECHO_ANCHOR = normalize(ECHO_ANCHOR_TEXT);

// The floor for direction 1 below, derived from ECHO_ANCHOR_TEXT rather than
// written as its own literal: the length of just its first sentence,
// "Transcribe this audio verbatim." — the shortest fragment of the
// instruction that is a complete clause on its own. Below this length a match
// is a coincidental handful of shared words, not identifiably an echo; at or
// above it, matching the instruction's own wording character-for-character is
// not a coincidence a real, unrelated utterance would produce.
const ECHO_FIRST_SENTENCE_LEN = normalize(ECHO_ANCHOR_TEXT.slice(0, ECHO_ANCHOR_TEXT.indexOf(".") + 1)).length;

// An echo must be impossible, not just unlikely. This is matched on a PREFIX
// of the normalised instruction, never on a keyword: a prefix match can only
// fire on text that begins the way the instruction begins, so a genuine
// question that merely mentions "transcript" — e.g. "How do I transcribe an
// audio file with this app?" — or that merely quotes the instruction
// mid-sentence — e.g. "I need you to transcribe this audio verbatim..." —
// cannot start with "transcribe this audio verbatim..." and is left alone.
// Both directions below use startsWith, never includes, for exactly that
// reason: a substring match would also catch that second example, which an
// opening-anchored prefix match cannot.
//
// Two directions are checked because an echo can end two different ways:
//   - direction 1: a short echo that cuts off partway through, e.g.
//     "Transcribe this audio verbatim." with no continuation. This is a true
//     prefix of the instruction, floored at ECHO_FIRST_SENTENCE_LEN so it can
//     only fire once the match reaches a complete clause — below that floor
//     a match is as likely to be a coincidence as an echo.
//   - direction 2: a longer echo that diverges from the instruction only at
//     the trailing punctuation the model chose to close its own sentence
//     with (e.g. "..." transcript." instead of continuing "..." transcript,
//     with no preamble..."), matched against ECHO_ANCHOR rather than the
//     full instruction since the two texts no longer agree past that point.
//
// A false positive here — dropping one real question that happens to open
// with those exact words — is the acceptable side to err on: the alternative
// is a repeat of the bug this guards against, a fabricated answer posted as
// the user's own message.
function looksLikeEcho(reply: string): boolean {
  const normalized = normalize(reply);
  if (normalized === "") return false;
  const instruction = normalize(TRANSCRIBE_PROMPT);
  return (
    (normalized.length >= ECHO_FIRST_SENTENCE_LEN && instruction.startsWith(normalized)) ||
    normalized.startsWith(ECHO_ANCHOR)
  );
}

// Whisper is never shown TRANSCRIBE_PROMPT and so cannot echo it, but it has a
// failure mode of its own: handed audio with no speech in it, it hallucinates
// one of a short, well-known set of stock phrases from its training data
// (YouTube captions, mostly). The caller's 300 ms energy floor is the real fix
// and catches nearly all of it — but a cough, a door slam or a chair scrape
// clears that floor while containing no speech at all, and what comes back then
// posts to the chat as the user's own question.
//
// Deliberately an EXACT-match list, and deliberately five entries long. A fuzzy
// filter here would eat real one-word and one-phrase answers; these are matched
// whole, after normalization and after a single trailing "." or "!" is stripped
// (Whisper punctuates its own hallucinations inconsistently). Entries are
// stored without that punctuation.
//
// The cost of a false positive is one dropped real utterance whose ENTIRE
// content is "thank you" or "you" — no question worth asking a document
// collection. The cost of a false negative is the defect this file exists to
// prevent, on the provider a `--providers openai` scaffold gets by default.
const WHISPER_SILENCE_HALLUCINATIONS = new Set([
  "thank you",
  "thanks for watching",
  "thank you for watching",
  "subtitles by the amara.org community",
  "you",
]);

function isWhisperSilenceArtifact(text: string): boolean {
  return WHISPER_SILENCE_HALLUCINATIONS.has(normalize(text).replace(/[.!]$/, "").trim());
}

// Whether a transcription request can be served at all: a speech-capable
// provider is selected, it has a model, and its key is set. No speech-capable
// provider is key-less, so a missing keyName reads as unconfigured rather than
// as "needs nothing" — if a key-less one ever appears, this is the one place
// that changes.
export function isTranscribeConfigured(s: RuntimeSettings): boolean {
  return (
    SPEECH_PROVIDER_IDS.includes(s.speechProvider) &&
    s.speechModel.trim() !== "" &&
    speechKey(s) !== null
  );
}

// Audio in, text out. An empty string means nothing intelligible was heard;
// a failure throws. The caller must never have to inspect a provider-shaped
// object to tell those apart.
export async function transcribe(
  audio: Uint8Array,
  mimeType: string,
  s: RuntimeSettings,
  task = "Transcription",
): Promise<string> {
  const provider = s.speechProvider;
  // Capability check must come before the key check: ollama and anthropic are
  // not speech-capable and (for ollama) key-less, so checking the key first
  // would report a misleading "no API key" for a provider that could never
  // transcribe regardless of key state.
  if (!SPEECH_PROVIDER_IDS.includes(provider)) {
    throw new Error(`${provider} cannot transcribe`);
  }
  const key = speechKey(s);
  if (!key) throw new MissingProviderKeyError(task, provider);

  try {
    if (provider === "openai") {
      const { text } = await experimental_transcribe({
        model: openaiTranscription(key, s.speechModel),
        audio,
      });
      const trimmed = text.trim();
      return isWhisperSilenceArtifact(trimmed) ? "" : trimmed;
    }
    if (provider === "google") {
      const { object } = await generateObject({
        model: googleChat(key, s.speechModel),
        schema: TranscriptionResult,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", data: audio, mimeType },
              { type: "text", text: TRANSCRIBE_PROMPT },
            ],
          },
        ],
      });
      // Deliberately no fallback to generateText. If a model cannot honour the
      // schema, the honest outcome is a failure the user sees -- a fallback would
      // restore the free-text path this change exists to remove, and leave two
      // sets of guarantees to keep in step.
      if (!object.hasSpeech) return "";
      const trimmed = object.transcript.trim();
      // The echo backstop still applies, now to the FIELD: nothing prevents a model
      // writing the instruction into the string it was asked to fill. Whisper (the
      // openai branch above) never sees TRANSCRIBE_PROMPT and so cannot echo it,
      // which is why it keeps its own, different backstop.
      return looksLikeEcho(trimmed) ? "" : trimmed;
    }
  } catch (err) {
    throw toProviderError(err, task, provider);
  }

  // Unreachable through the app: speechProvider is refined against
  // SPEECH_PROVIDER_IDS. Explicit so the file has no silent fall-through.
  throw new Error(`${provider} cannot transcribe`);
}
