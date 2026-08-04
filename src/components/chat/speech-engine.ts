// The seam between the hook and the browser's speech API.
//
// It takes a string and a language rather than a SpeechSynthesisUtterance on
// purpose: jsdom implements neither speechSynthesis nor the utterance
// constructor, so a test could not build an argument for the real signature.
// Hiding the constructor behind plain values is what makes the hook testable.
export interface SpeechEngine {
  speak(text: string, lang: string): void;
  cancel(): void;
}

// Null when the browser has no speech synthesis at all. The caller renders no
// toggle in that case rather than offering a switch that produces silence.
export function browserSpeechEngine(): SpeechEngine | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const synth = window.speechSynthesis;
  return {
    speak(text, lang) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      synth.speak(utterance);
    },
    cancel() {
      synth.cancel();
    },
  };
}
