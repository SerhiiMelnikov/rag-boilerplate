// An image turn never calls the chat model: it stores a fixed intro and puts its
// matches in the message's `images[]` field. The next turn's prompt is rebuilt from
// message CONTENT only, so before 0.6.4 the assistant had no idea what it had just
// shown — asked why it chose a picture, it truthfully had nothing to answer from.
// Putting the captions in the content will close that, and the caption is the right
// evidence: it is exactly what the relevance verifier judged.
export const CAPTION_CAP = 160;

// First sentence, or the whole caption when it has no terminator. Deliberately naive:
// an abbreviation ("e.g. a bike") splits early. The cost of that is a slightly short
// line in a chat message, which does not justify a sentence tokenizer here.
function firstSentence(caption: string): string {
  const trimmed = caption.trim();
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(trimmed);
  const sentence = match ? match[0] : trimmed;
  return sentence.length > CAPTION_CAP ? `${sentence.slice(0, CAPTION_CAP)}…` : sentence;
}

export function imageAnswerText(intro: string, images: Array<{ caption: string }>): string {
  // A caption that is empty or whitespace-only is DROPPED, not rendered as a bare
  // "- " line. Captions are model-written and a blank one is possible; the line
  // would be shown to the user, stored as the message's content, replayed to the
  // model as history on the next turn, and read out as a lone list marker by the
  // spoken-answers path. The image itself is unaffected — it travels in images[],
  // which this function does not touch. All captions blank degrades to the same
  // intro-only output as no images at all.
  const lines = images
    .map((img) => firstSentence(img.caption))
    .filter((sentence) => sentence.length > 0)
    .map((sentence) => `- ${sentence}`);
  return lines.length === 0 ? intro : `${intro}\n\n${lines.join("\n\n")}`;
}
