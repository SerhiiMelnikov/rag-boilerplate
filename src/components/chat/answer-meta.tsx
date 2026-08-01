"use client";

import { Rating } from "./rating";

// What an answer stands on, in words. Pure and exported so the four cases are tested
// without a DOM — and so ChatMessage can take `ticks` for the gutter from the same
// place this row takes its text, instead of the two drifting apart.
//
// The image case exists because the chat handler persists an image answer with
// sources: [] (replyWithMessage), so the plain zero branch would state a falsehood.
export function provenance(
  sourceCount: number,
  imageCount: number,
): { ticks: number; before: string; count: number | null; after: string } {
  if (imageCount > 0) {
    return {
      ticks: imageCount,
      before: "",
      count: imageCount,
      after: imageCount === 1 ? "image from your library" : "images from your library",
    };
  }
  if (sourceCount > 0) {
    return {
      ticks: sourceCount,
      before: "Grounded in",
      count: sourceCount,
      after: sourceCount === 1 ? "passage" : "passages",
    };
  }
  return { ticks: 0, before: "Answered without your documents", count: null, after: "" };
}

export function AnswerMeta({
  messageId,
  sourceCount,
  imageCount,
  rating,
}: {
  messageId: string;
  sourceCount: number;
  imageCount: number;
  rating: number | null;
}) {
  const { before, count, after } = provenance(sourceCount, imageCount);

  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      {/* The gutter beside this answer is aria-hidden; this line is the accessible
          carrier of the same fact. Only the number is machine data, so only the
          number takes the mono face. */}
      <p className="text-sm text-ink-muted">
        {before}
        {count !== null && (
          <>
            {before ? " " : ""}
            <span className="font-mono tabular-nums">{count}</span>{" "}
          </>
        )}
        {after}
      </p>
      <Rating messageId={messageId} initial={rating} />
    </div>
  );
}
