// Markdown, as rendered in the transcript, turned into something a voice can read.
//
// The transcript uses react-markdown + remark-gfm + rehype-highlight, so GFM is
// in scope: tables and strikethrough, not only CommonMark. Read aloud raw,
// "**bold**" becomes "asterisk asterisk bold asterisk asterisk" and a table
// becomes a stream of pipes.
//
// Order matters throughout, and the first two rules are the load-bearing ones:
// a fenced block is removed before anything else can see inside it, and the
// UNCLOSED trailing fence is removed too. While an answer streams, a fence
// routinely opens in one chunk and closes several chunks later; without the
// second rule the body of a code block is spoken line by line until it closes.
export function speakableText(markdown: string): string {
  let s = markdown;

  s = s.replace(/```[\s\S]*?```/g, " code block. ");
  s = s.replace(/```[\s\S]*$/, " code block. ");

  // A run of table rows. Named rather than read: pipes and dashes carry no meaning
  // aloud, and the cell text out of order is worse than useless. The trailing
  // newline of the LAST row is deliberately left unconsumed (only the newlines
  // *between* rows are matched, via the lookahead-free repeat below): a table is
  // followed by a blank line, and swallowing that row's own line terminator would
  // eat one half of the blank line, merging "table." into the sentence after it.
  s = s.replace(/^[ \t]*\|.*(?:\n[ \t]*\|.*)*/gm, " table. ");

  // Images before links — an image is a link with a leading "!", so the link rule
  // would otherwise strip the "!" and leave the alt text looking like link text.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // \S+ alone would greedily swallow trailing sentence punctuation (a URL ending a
  // sentence is ordinary in an answer that cites sources), merging that sentence
  // with the next one under the sentence splitter. Requiring the match to end on a
  // non-punctuation character makes it backtrack off any trailing '.', ',', '!',
  // '?', ';', ':', quote, ellipsis or closing bracket instead of consuming it.
  s = s.replace(/https?:\/\/\S*[^\s.,!?;:'"…)\]}]/g, "link");

  // Block markers, at line start only. The horizontal-rule check runs before the
  // list-marker check: a spaced rule ("- - -") also looks like a list item ("- ")
  // followed by more text, so if the list-marker rule ran first it would strip
  // the leading "- " and leave "- -" behind — text the HR rule no longer matches.
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  s = s.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "");
  s = s.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // Inline markers. `_` is matched only at a word boundary: JavaScript's \w
  // includes the underscore, so there is no boundary inside snake_case and an
  // identifier survives, while the wrapping underscores of _emphasis_ do not.
  s = s.replace(/`+/g, "");
  s = s.replace(/\*\*|~~|\*/g, "");
  s = s.replace(/\b_+|_+\b/g, "");

  // Collapse horizontal whitespace but never newlines: completedSentences treats a
  // blank line as a sentence boundary, so the paragraph structure has to survive.
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]*\n[ \t]*/g, "\n");

  return s.trim();
}
