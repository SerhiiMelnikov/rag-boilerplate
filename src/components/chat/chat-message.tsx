"use client";

import { Gutter } from "@/components/ui/gutter";
import { cn } from "@/lib/cn";
import { MessageContent } from "./message-content";
import { ImageResults } from "./image-results";
import { AnswerMeta, provenance } from "./answer-meta";
import type { PersistedMessage } from "./types";

// The gutter's footprint without the gutter's claim. An answer that has not
// finished arriving is neither grounded nor ungrounded, so `<Gutter sources={0} />`
// — which renders the dashed "ungrounded" rule — would state something false for as
// long as the answer takes. Matching Gutter's box classes keeps the column width
// steady so the prose does not shift when the real rule replaces this one.
export function GutterPlaceholder() {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block w-[3px] min-h-6 flex-none self-stretch rounded-sm bg-border"
    />
  );
}

// One turn of the transcript. A question is a heading; an answer is prose with the
// provenance gutter beside it. No bubbles — the design reads as a document, and the
// gutter is a vertical rule, which needs an edge to sit on.
export function ChatMessage({
  role,
  content,
  saved,
  isFirst,
}: {
  role: "user" | "assistant";
  content: string;
  saved?: PersistedMessage;
  isFirst: boolean;
}) {
  if (role === "user") {
    return (
      <div className={cn("pt-8", !isFirst && "border-t border-border")}>
        {/* Plain text, not markdown: a question that starts with '#' is a question,
            not a heading, and the transcript's headings are these. */}
        <h2 className="whitespace-pre-line text-lg font-semibold text-ink">{content}</h2>
      </div>
    );
  }

  const images = saved?.images ?? [];
  const { ticks } = provenance(saved?.sourceCount ?? 0, images.length);

  return (
    <div className="flex gap-4 pt-4">
      {saved ? (
        <Gutter sources={ticks} />
      ) : (
        <GutterPlaceholder />
      )}
      <div className="min-w-0 flex-1">
        <MessageContent content={content} />
        <ImageResults images={images} />
        {saved && (
          <AnswerMeta
            messageId={saved.id}
            sourceCount={saved.sourceCount}
            imageCount={images.length}
            rating={saved.rating}
          />
        )}
      </div>
    </div>
  );
}
