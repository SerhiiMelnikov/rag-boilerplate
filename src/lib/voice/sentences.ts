// Sentences that are FINISHED, in text that is still arriving.
//
// The hook calls this on every streaming update with the whole answer so far and
// speaks whatever is new, so a partial trailing sentence has to be withheld:
// speaking "the answer stands on 3 pas" and the rest a moment later is worse than
// a short silence. At the end of the stream the caller passes flush and the
// fragment is finally returned.
//
// Input is already normalised by speakableText, so there is no markdown here.

// Deliberately short, and English-only. Ukrainian prose rarely uses these forms,
// and a longer list buys accuracy nobody will measure.
// "no" (the numero abbreviation, "No. 5") was deliberately left out: a sentence
// genuinely ending in the word "No." is ordinary conversation, and far more
// common in a document-grounded assistant's answers than the numero sense —
// withholding it until flush was the wrong tradeoff.
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "dr", "mr", "mrs", "ms", "prof", "fig", "approx"]);

function isSentenceEnd(text: string, i: number, flush: boolean): boolean {
  const ch = text[i];
  if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") return false;

  // "3.5" and "v1.2": a terminator glued to what follows is not one.
  const next = text[i + 1];
  if (next !== undefined && !/\s/.test(next)) return false;

  // The end of arrived text is NOT a sentence end unless the caller is flushing.
  // It is tempting to treat it as implicit whitespace (the common case when the
  // answer is complete), but this function is called on a growing prefix while
  // streaming, and "end of arrived text" is indistinguishable from "a delta
  // boundary landed here" — the case that matters is a terminator glued to
  // something that has not arrived yet, like a URL cut off mid-domain ("...
  // docs." with ".example.com/x" still in flight) or a decimal/version number
  // ("3." before "5" arrives). Guessing "sentence end" here and being wrong
  // changes an already-returned element once the rest arrives, which is exactly
  // the stability the caller depends on. This one rule subsumes the old
  // digit-glued special case: withhold until flush, which still returns the
  // tail via its own fallback below if the stream really did end here.
  if (next === undefined && !flush) return false;

  if (ch === ".") {
    const before = text.slice(0, i);
    const m = /([A-Za-z][A-Za-z.]*)$/.exec(before);
    if (m) {
      const token = m[1].toLowerCase().replace(/\.$/, "");
      if (token.length === 1) return false; // an initial: "Ask A. Smith"
      if (ABBREVIATIONS.has(token)) return false; // "e.g." / "etc."
    }
  }
  return true;
}

export function completedSentences(text: string, opts: { flush?: boolean } = {}): string[] {
  const out: string[] = [];
  let start = 0;
  const flush = opts.flush ?? false;

  for (let i = 0; i < text.length; i++) {
    if (isSentenceEnd(text, i, flush)) {
      const piece = text.slice(start, i + 1).trim();
      if (piece) out.push(piece);
      start = i + 1;
      continue;
    }
    // A blank line closes whatever came before it even without a full stop, so a
    // heading or a bare list item is still spoken as its own unit.
    if (text[i] === "\n" && /^[ \t]*\n/.test(text.slice(i + 1))) {
      const piece = text.slice(start, i).trim();
      if (piece) out.push(piece);
      start = i + 1;
    }
  }

  // Everything after the last boundary is the unfinished tail: withheld while the
  // answer streams, returned once the caller says the stream is over.
  if (flush) {
    const tail = text.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}
