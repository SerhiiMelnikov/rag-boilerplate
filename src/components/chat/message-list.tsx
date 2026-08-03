"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ChatMessage, GutterPlaceholder } from "./chat-message";
import type { PersistedMessage } from "./types";

interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function MessageList({
  messages,
  persistedById,
  pending,
  error,
}: {
  messages: StreamMessage[];
  persistedById: Map<string, PersistedMessage>;
  pending: boolean;
  error?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const turnCount = messages.length;

  // Follow a new turn or a new error, not every token: scrolling on content would
  // fight anyone reading back through the conversation while an answer streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turnCount, error]);

  // useChat appends the assistant message before its first token arrives, so an
  // empty *trailing* assistant message is a stream that has not started. An empty
  // message anywhere else is a persisted answer that genuinely came back empty:
  // render it, because deleting a turn from someone's history is worse than showing
  // an empty one, and never mistake it for something still in flight.
  const last = messages.at(-1);
  const streaming = last?.role === "assistant" && last.content.length === 0;
  const visible = streaming ? messages.slice(0, -1) : messages;
  const waiting = pending || streaming;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* 68ch is the comfortable measure for prose, and on a phone or a laptop it is
          what the viewport gives anyway. On a wide monitor it left most of the screen
          empty beside a narrow column, so the transcript widens past that breakpoint —
          still bounded, because a line that runs the full width of a 27" display is
          harder to read, not easier. */}
      <div className="mx-auto w-full max-w-[68ch] px-4 pb-6 md:px-6 lg:max-w-[86ch] 2xl:max-w-[100ch]">
        {visible.map((m, index) => (
          <ChatMessage
            key={m.id}
            role={m.role}
            content={m.content}
            saved={persistedById.get(m.id)}
            isFirst={index === 0}
          />
        ))}
        {waiting && <PendingAnswer />}
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function PendingAnswer() {
  return (
    <div className="flex gap-4 pt-4">
      {/* The same neutral rule a streaming answer uses, imported rather than
          re-authored: it is the gutter's footprint without the gutter's claim, and
          two copies would drift the moment one of them is adjusted. */}
      <GutterPlaceholder />
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner label="Thinking" /> Thinking…
      </span>
    </div>
  );
}
