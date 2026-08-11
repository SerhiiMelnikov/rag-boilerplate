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
// ECHO_ANCHOR_TEXT and NO_SPEECH_CLAUSE are the two clauses this file matches
// replies against, held out as their own constants and spliced INTO the prompt
// below (rather than the prompt's wording being duplicated separately as
// anchors) so the wording and the matchers can truly never drift apart: there
// is only one place that spells out how the instruction begins, and only one
// that spells out the escape hatch.
const NO_SPEECH_SENTINEL = "NO_SPEECH";
const ECHO_ANCHOR_TEXT = "Transcribe this audio verbatim. Output only the transcript";
const NO_SPEECH_CLAUSE =
  `If the audio contains no discernible speech, reply with exactly: ${NO_SPEECH_SENTINEL}`;
const TRANSCRIBE_PROMPT =
  `${ECHO_ANCHOR_TEXT}, with no preamble, ` +
  `commentary or translation. ${NO_SPEECH_CLAUSE}`;

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

// A model asked to emit the sentinel can still fence it, punctuate it,
// paraphrase it as the two plain words, or — just as often — emit it and then
// explain itself: "NO_SPEECH — the audio contains only background noise", "No
// speech was detected in the recording." An exact string match is not enough,
// and neither is a match anchored at BOTH ends, which is what this used to be:
// every one of those explanatory forms slipped past it AND past both echo
// directions (which are anchored on the instruction's opening, not on the
// sentinel), and posted to the chat as the user's own question. That is the
// shipped bug's exact shape.
//
// So the pattern is anchored at the OPENING only, exactly like the echo
// matcher below, and narrowed by a length cap instead of by an end anchor. It
// accepts, case/space-insensitively: the sentinel ("NO_SPEECH") or its
// natural-language form ("no speech"), optionally opened with a backtick, as
// the START of a reply no longer than NO_SPEECH_MAX_LEN. `\b` is what keeps
// "no speechwriter" out; the cap is what keeps a real, longer utterance out.
//
// The cap is derived, not chosen: it is the length of NO_SPEECH_CLAUSE, the
// instruction's own escape hatch — the sentence the model is paraphrasing when
// it explains itself. A reply no longer than the clause it was told to obey is
// still that clause; past that length it is prose the model wrote for its own
// reasons, and a transcript is the likelier reading. Deriving it from the
// clause rather than writing a literal is the same discipline
// ECHO_FIRST_SENTENCE_LEN follows, and for the same reason: reword the prompt
// and the bound moves with it.
//
// This deliberately also drops a genuine short user message that OPENS with
// the two words "no speech" (e.g. "No speech." in answer to "was there any
// speech?"). That is the acceptable side to err on, for exactly the reason
// direction 1's comment below gives for the echo matcher: the alternative is a
// repeat of the bug this file exists to prevent, a fabricated non-transcript
// posted as the user's own message.
const NO_SPEECH_PATTERN = /^`?no[_ ]speech\b/;
const NO_SPEECH_MAX_LEN = normalize(NO_SPEECH_CLAUSE).length;

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
  if (normalized.length <= NO_SPEECH_MAX_LEN && NO_SPEECH_PATTERN.test(normalized)) return true;
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
// whole, after the same normalization and the same single trailing "." or "!"
// the sentinel pattern already tolerates (Whisper punctuates its own
// hallucinations inconsistently). Entries are stored without that punctuation.
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

// A chat model told "no preamble" mostly obeys. On the rare occasion it does
// not, a plausible shape is a short lead-in ending in a colon, then the
// transcript: "Sure, here's the transcript: <the real transcript>". THIS
// EXACT SHAPE HAS NOT BEEN OBSERVED IN THIS PRODUCT -- the guard below is a
// precaution taken after being told that, not a fix for something seen in
// production, and it stays narrow for that reason. looksLikeEcho cannot see
// this shape -- it is not the instruction repeated back -- and the sentinel
// matcher cannot either.
//
// UNLIKE every other matcher in this file, this one errs toward NOT acting. The
// others accept a false positive because dropping one real utterance beats posting
// a fabrication as the user's own message. Here the cost is inverted: a false
// positive deletes the opening words of a genuine transcript and hands the user a
// quietly truncated version of what they said. So stripping requires three
// independent conditions, not one: an opening that reads as an acknowledgement,
// vocabulary that names what was acknowledged, and a preamble no longer than the
// cap -- all before the first colon, and only when something follows it.
//
// A LENGTH CAP ALONE CANNOT DO THIS. "I need the following from the report:
// revenue, headcount and the churn number" puts its colon at character 36, which
// is not meaningfully longer than "Sure, here's the transcript" (27) is. Any cap
// wide enough to admit the acknowledgement phrase (27 chars) comfortably admits
// this real sentence's lead too (36 chars) -- the two are too close in length for
// a cap to tell apart, whatever the cap's value.
//
// AN UNANCHORED VOCABULARY SEARCH ALONE CANNOT DO THIS EITHER, and gets it
// backwards more often than the length cap does: in speech a colon overwhelmingly
// introduces a timestamp or a ratio ("...transcript at 12:45", "...transcript
// mentions a ratio of 3:1"), and the sentence carrying that colon is exactly
// where a user of a transcription feature is likeliest to say the word
// "transcript" out loud -- the two co-occur by construction, not coincidence.
// A bare includes() check over the whole lead treats every one of these as a
// preamble and deletes the user's real question (see the "damage table"
// regression tests below for the specific sentences this was verified against).
//
// So the vocabulary match is additionally ANCHORED AT THE START of the lead, the
// same discipline looksLikeEcho already applies to the instruction itself
// (startsWith, never a bare substring test over the whole reply): the lead must
// OPEN with one of a short, closed list of acknowledgement phrases a model
// plausibly uses to preface a reply, AND separately contain the vocabulary word.
// None of the timestamp/ratio sentences above open with any of these phrases, so
// none of them qualify regardless of what the rest of the lead contains.
//
// PREFACE_KEYWORD is derived as the LAST WORD of ECHO_ANCHOR_TEXT ("...Output
// only the transcript"), in the discipline ECHO_FIRST_SENTENCE_LEN and
// NO_SPEECH_MAX_LEN already follow: reword the prompt's closing noun and this
// moves with it, rather than silently drifting out of sync with a prompt edit
// that does not also touch this file.
//
// The length bound is a third, independent condition, not a second: a preamble
// may be no longer than the instruction clause it is acknowledging. It is not
// redundant with the opener-anchored vocabulary check above -- a spoken message
// can plausibly open with an acknowledgement, ramble for a while, and only then
// reach its real point: "Sure, so basically what happened was we were going over
// the transcript from yesterday's call and there's an issue: can you check the
// timestamp around minute five" opens with "Sure" and names "transcript", but
// deleting everything before its colon would still discard real content the
// user said. See the matching test below for the falsification that confirmed
// this bound is independently necessary, not decorative.
//
// DELIBERATELY ENGLISH-ONLY: "Звичайно, ось транскрипт: де рахунок" (a Ukrainian
// preamble of the identical shape) is not recognised and passes through
// unchanged. That is a scope decision, not an oversight -- this product's chat
// is used in Ukrainian, but extending PREFACE_OPENERS and PREFACE_KEYWORD to
// another language was decided against for now. Passing text through unchanged
// is the safe direction to be wrong in here, same as every other case this
// guard declines to act on.
const PREFACE_OPENERS = ["here is", "here's", "sure", "okay", "of course", "below is"];
const PREFACE_KEYWORD = normalize(ECHO_ANCHOR_TEXT.split(" ").at(-1) ?? "");
const PREFACE_MAX_LEN = normalize(ECHO_ANCHOR_TEXT).length;

function stripPreface(text: string): string {
  const colon = text.indexOf(":");
  if (colon === -1) return text;
  const lead = normalize(text.slice(0, colon));
  if (lead.length > PREFACE_MAX_LEN) return text;
  if (!PREFACE_OPENERS.some((opener) => lead.startsWith(opener))) return text;
  if (!lead.includes(PREFACE_KEYWORD)) return text;
  const rest = text.slice(colon + 1).trim();
  // Nothing after the colon means there is no transcript to recover; leave the reply
  // alone and let the existing empty/echo handling decide what it is.
  if (rest === "") return text;
  return rest;
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
      const deprefaced = stripPreface(trimmed);
      // The echo backstop applies only here: Whisper (the openai branch above)
      // never sees TRANSCRIBE_PROMPT and so cannot echo it. Whisper's own
      // failure mode on silence is a hallucinated stock phrase rather than an
      // echo, which is why it gets its own, different backstop above. Neither
      // is the real fix — the caller's speech-detection gate is, for both
      // providers; these two catch what clears it.
      //
      // looksLikeEcho runs on BOTH trimmed and deprefaced. Checking deprefaced
      // is what does the real work today: it is what recognises a bare sentinel
      // sitting behind a benign acknowledgement ("Here is the transcript:
      // NO_SPEECH" -> stripped to "NO_SPEECH", which trimmed alone would miss
      // entirely, since "here is the transcript..." doesn't start like the
      // sentinel or the instruction).
      //
      // Checking trimmed as well is deliberate belt-and-braces, not currently
      // load-bearing: PREFACE_OPENERS (below) requires a lead to open with an
      // acknowledgement phrase before stripPreface will touch it at all, and
      // none of those phrases share a prefix with "no speech"/"no_speech" or
      // "transcribe this audio verbatim" -- so whenever stripPreface actually
      // changes the text, trimmed cannot simultaneously satisfy looksLikeEcho,
      // and whenever it does not change the text, deprefaced equals trimmed and
      // checking deprefaced already covers it. Falsifying the trimmed half
      // alone currently produces no test failure. It stays anyway: it is one
      // string comparison, and it is the difference between "safe by proof, as
      // long as no one edits PREFACE_OPENERS without re-checking this" and
      // "safe outright" if that list ever grows to include a phrase that starts
      // with "no" or "transcribe".
      return looksLikeEcho(trimmed) || looksLikeEcho(deprefaced) ? "" : deprefaced;
    }
  } catch (err) {
    throw toProviderError(err, task, provider);
  }

  // Unreachable through the app: speechProvider is refined against
  // SPEECH_PROVIDER_IDS. Explicit so the file has no silent fall-through.
  throw new Error(`${provider} cannot transcribe`);
}
