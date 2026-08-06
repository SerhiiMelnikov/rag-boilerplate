import { experimental_transcribe, generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { SPEECH_PROVIDER_IDS, keyNameOf } from "@/lib/providers/catalog";
import { MissingProviderKeyError, toProviderError } from "./types";
import { openaiTranscription } from "./openai";
import { googleChat } from "./google";

// Gemini has no transcription model, so it is asked to transcribe through the
// ordinary chat model. Two clauses are load-bearing. The first forbids
// answering: the audio is a question, and a chat model's first instinct is to
// reply to it. The second gives it something to say when there is nothing to
// transcribe — without an escape hatch, a model handed silence and told
// "output only the transcript" has no valid output and echoes the instruction
// back instead, which is exactly what shipped to a real user.
//
// ECHO_ANCHOR_TEXT is the opening clause, held out as its own constant and
// spliced INTO the prompt below (rather than the prompt's wording being
// duplicated separately as an anchor to match echoes against) so the two can
// truly never drift apart: there is only one place that spells out how the
// instruction begins.
const NO_SPEECH_SENTINEL = "NO_SPEECH";
const ECHO_ANCHOR_TEXT = "Transcribe this audio verbatim. Output only the transcript";
const TRANSCRIBE_PROMPT =
  `${ECHO_ANCHOR_TEXT}, with no preamble, ` +
  "commentary or translation. If the audio contains no discernible speech, reply " +
  `with exactly: ${NO_SPEECH_SENTINEL}`;

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
// instruction that is a complete clause on its own (per the file-level
// comment, the one that forbids answering). Below this length a match is a
// coincidental handful of shared words, not identifiably an echo; at or above
// it, matching the instruction's own wording character-for-character is not
// a coincidence a real, unrelated utterance would produce.
const ECHO_FIRST_SENTENCE_LEN = normalize(ECHO_ANCHOR_TEXT.slice(0, ECHO_ANCHOR_TEXT.indexOf(".") + 1)).length;

// A model asked to emit the sentinel can still fence it, punctuate it, or
// otherwise decorate it instead of returning it bare — exactly the kind of
// deviation that produced the shipped bug in the first place, so an exact
// string match is not enough. Tolerates a trailing "." or "!" and a wrap in
// backticks (single-token answers get fenced constantly); nothing looser than
// that, since the sentinel is a fixed word the model was told verbatim, not
// free text where a fuzzier match would be justified.
const NO_SPEECH_PATTERN = /^`?no[_ ]speech`?[.!]?$/;

// The sentinel makes an echo less likely but not impossible (a model can
// still ignore the escape hatch and repeat the instruction instead), and what
// shipped to a real user must be impossible, not just less likely. This is
// matched on a PREFIX of the normalised instruction, never on a keyword: a
// prefix match can only fire on text that begins the way the instruction
// begins, so a genuine question that merely mentions "transcript" — e.g. "How
// do I transcribe an audio file with this app?" — or that merely quotes the
// instruction mid-sentence — e.g. "I need you to transcribe this audio
// verbatim..." — cannot start with "transcribe this audio verbatim..." and is
// left alone. Both directions below use startsWith, never includes, for
// exactly that reason: a substring match would also catch that second
// example, which an opening-anchored prefix match cannot.
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
  if (NO_SPEECH_PATTERN.test(normalized)) return true;
  const instruction = normalize(TRANSCRIBE_PROMPT);
  return (
    (normalized.length >= ECHO_FIRST_SENTENCE_LEN && instruction.startsWith(normalized)) ||
    normalized.startsWith(ECHO_ANCHOR)
  );
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
      return text.trim();
    }
    if (provider === "google") {
      const { text } = await generateText({
        model: googleChat(key, s.speechModel),
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
      const trimmed = text.trim();
      // The echo backstop applies only here: Whisper (the openai branch above)
      // never sees TRANSCRIBE_PROMPT and so cannot echo it. Whisper's own
      // failure mode on silence is a hallucinated stock phrase rather than an
      // echo, and that is covered upstream by the caller's speech-detection
      // gate, not here — which is why that gate, not this backstop, is the
      // real fix for both providers.
      return looksLikeEcho(trimmed) ? "" : trimmed;
    }
  } catch (err) {
    throw toProviderError(err, task, provider);
  }

  // Unreachable through the app: speechProvider is refined against
  // SPEECH_PROVIDER_IDS. Explicit so the file has no silent fall-through.
  throw new Error(`${provider} cannot transcribe`);
}
