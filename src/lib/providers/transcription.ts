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
const NO_SPEECH_SENTINEL = "NO_SPEECH";
const TRANSCRIBE_PROMPT =
  "Transcribe this audio verbatim. Output only the transcript, with no preamble, " +
  "commentary or translation. If the audio contains no discernible speech, reply " +
  `with exactly: ${NO_SPEECH_SENTINEL}`;

function speechKey(s: RuntimeSettings): string | null {
  const name = keyNameOf(s.speechProvider);
  return name ? s.keys[name] : null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// The opening clause of TRANSCRIBE_PROMPT, with no trailing punctuation. This
// is the anchor an echo is matched against below — kept as a slice of the
// literal prompt text (not a separately maintained string) so the two can
// never drift out of sync.
const ECHO_ANCHOR = normalize("Transcribe this audio verbatim. Output only the transcript");

// The sentinel makes an echo less likely but not impossible (a model can
// still ignore the escape hatch and repeat the instruction instead), and what
// shipped to a real user must be impossible, not just less likely. This is
// matched on a PREFIX of the normalised instruction, never on a keyword: a
// prefix match can only fire on text that begins the way the instruction
// begins, so a genuine question that merely mentions "transcript" — e.g. "How
// do I transcribe an audio file with this app?" — cannot start with
// "transcribe this audio verbatim..." and is left alone. Two directions are
// checked because an echo can end two different ways: a short echo that cuts
// off is a true prefix of the instruction (direction 1), while a longer one
// can diverge at the trailing punctuation the model chose to close its own
// sentence with instead of continuing the original one (direction 2, matched
// against the anchor rather than the full instruction). A false positive here
// — dropping one real question that happens to open with those exact words —
// is the acceptable side to err on: the alternative is a repeat of the bug
// this guards against, a fabricated answer posted as the user's own message.
function looksLikeEcho(reply: string): boolean {
  const normalized = normalize(reply);
  if (normalized === "") return false;
  if (normalized === normalize(NO_SPEECH_SENTINEL)) return true;
  const instruction = normalize(TRANSCRIBE_PROMPT);
  return instruction.startsWith(normalized) || normalized.startsWith(ECHO_ANCHOR);
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
