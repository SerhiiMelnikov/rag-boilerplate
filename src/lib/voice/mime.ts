// The container handed to MediaRecorder, negotiated rather than assumed:
// Safari does not offer the same types as Chrome, and the chosen type has to be
// one the transcription endpoint accepts (see ALLOWED_AUDIO_MIME in
// src/api/chat/transcribe/handler.ts — these two lists must stay compatible).
//
// Order is by preference, not by popularity. Opus in WebM is what Chrome and
// Firefox give, is small, and is verified end to end against Gemini; audio/mp4
// is Safari's only offer and is NOT verified against a provider.
export const MIME_PREFERENCE = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

// Null means this browser can record nothing we can send — the caller renders
// no microphone rather than a button that fails on press.
//
// Takes MediaRecorder.isTypeSupported as an argument rather than reaching for
// it, which is what makes the ordering testable without a MediaRecorder.
export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return MIME_PREFERENCE.find((type) => isSupported(type)) ?? null;
}
