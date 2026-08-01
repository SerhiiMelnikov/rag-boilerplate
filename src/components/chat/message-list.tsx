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

  // Follow a new turn, not every token: scrolling on content would fight anyone
  // reading back through the conversation while an answer streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turnCount]);

  // useChat appends the assistant message before its first token arrives. Rendering
  // that would put an empty answer block on screen, so it becomes the pending state.
  const visible = messages.filter((m) => !(m.role === "assistant" && m.content.length === 0));
  const waiting = pending || visible.length < messages.length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[68ch] px-4 pb-6 md:px-6">
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
