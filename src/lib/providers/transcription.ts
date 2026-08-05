import { experimental_transcribe, generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { SPEECH_PROVIDER_IDS, keyNameOf } from "@/lib/providers/catalog";
import { MissingProviderKeyError, toProviderError } from "./types";
import { openaiTranscription } from "./openai";
import { googleChat } from "./google";

// Gemini has no transcription model, so it is asked to transcribe through the
// ordinary chat model. The instruction has to forbid answering: the audio is a
// question, and a chat model's first instinct is to reply to it. Verified
// against the live API before this was written — it returns the transcript.
const TRANSCRIBE_PROMPT =
  "Transcribe this audio verbatim. Output only the transcript, with no preamble, commentary or translation.";

function speechKey(s: RuntimeSettings): string | null {
  const name = keyNameOf(s.speechProvider);
  return name ? s.keys[name] : null;
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
      return text.trim();
    }
  } catch (err) {
    throw toProviderError(err, task, provider);
  }

  // Unreachable through the app: speechProvider is refined against
  // SPEECH_PROVIDER_IDS. Explicit so the file has no silent fall-through.
  throw new Error(`${provider} cannot transcribe`);
}
