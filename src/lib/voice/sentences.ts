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

function isSentenceEnd(text: string, i: number): boolean {
  const ch = text[i];
  if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") return false;

  // "3.5" and "v1.2": a terminator glued to what follows is not one. End of input
  // counts as whitespace — that is the common case when the answer is complete.
  const next = text[i + 1];
  if (next !== undefined && !/\s/.test(next)) return false;

  if (ch === ".") {
    const before = text.slice(0, i);
    const m = /([A-Za-z][A-Za-z.]*)$/.exec(before);
    if (m) {
      const token = m[1].toLowerCase().replace(/\.$/, "");
      if (token.length === 1) return false; // an initial: "Ask A. Smith"
      if (ABBREVIATIONS.has(token)) return false; // "e.g." / "etc."
    } else if (next === undefined && /\d$/.test(before)) {
      // A digit sits right before the dot, and nothing has arrived after it yet.
      // "End of input counts as whitespace" (above) cannot be trusted here: this
      // is exactly what a decimal or version number looks like the instant the
      // stream pauses between "3." and "3.5" — the digit-glued case a few lines
      // up only catches it once the "5" has actually arrived. Treating this as a
      // sentence end would let a growing "3." (withheld) turn into "3.5 today."
      // (a single, different sentence), changing an already-returned element —
      // exactly the stability the caller depends on. Withhold; flush's own
      // tail-fallback below still returns it if the stream really did end here.
      return false;
    }
  }
  return true;
}

export function completedSentences(text: string, opts: { flush?: boolean } = {}): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (isSentenceEnd(text, i)) {
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
  if (opts.flush) {
    const tail = text.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}
