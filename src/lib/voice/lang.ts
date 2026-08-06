// Which language a spoken sentence should be read in.
//
// utterance.lang used to come from navigator.language — the browser's UI
// language, not the answer's. Confirmed by ear: a desktop browser running in
// English reads Ukrainian with a heavy English accent, while a phone whose OS
// language matches sounds correct.
//
// This is a HEURISTIC and is documented as one. Cyrillic is not exclusively
// Ukrainian; Russian, Bulgarian and Serbian share the script. The alternative —
// a whole voice-selection settings surface — is not justified by one
// observation, and null here means "no evidence", which lets the caller keep
// using the browser's own preference.
//
// Applied per SENTENCE, not per answer: speech is already emitted sentence by
// sentence, so a mixed answer gets each part read in the right voice for free.
const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

export function detectSpeechLang(sentence: string): string | null {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of sentence) {
    if (CYRILLIC.test(ch)) cyrillic += 1;
    else if (LATIN.test(ch)) latin += 1;
  }
  // Strictly greater: a tie is not evidence.
  return cyrillic > latin ? "uk-UA" : null;
}
