"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { MessageContent } from "./message-content";
import { Sources } from "./sources";
import { Rating } from "./rating";

interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: { documentId: string; filename: string; chunkId: string; score: number }[];
  rating: number | null;
}

// One conversation's chat. Streams via useChat; after each turn refetches the
// conversation so sources/ratings/message-ids come from server truth.
export function ChatView({ conversationId }: { conversationId: string }) {
  const [persisted, setPersisted] = useState<PersistedMessage[]>([]);
  const { messages, input, handleInputChange, handleSubmit, status, setMessages } = useChat({
    api: "/api/chat",
    body: { conversationId },
  });
  const prevStatus = useRef(status);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (!res.ok) return;
    const data = await res.json();
    setPersisted(data.messages ?? []);
    setMessages(
      (data.messages ?? []).map((m: PersistedMessage) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
  }, [conversationId, setMessages]);

  // Load existing history when the conversation changes.
  useEffect(() => {
    setPersisted([]);
    void loadHistory();
  }, [loadHistory]);

  // When a streamed turn finishes (status returns to "ready"), refetch persisted data.
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") void loadHistory();
    prevStatus.current = status;
  }, [status, loadHistory]);

  const persistedById = new Map(persisted.map((m) => [m.id, m]));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => {
          const saved = persistedById.get(m.id);
          return (
            <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[80ch] rounded-lg px-3 py-2 ${
                  m.role === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                <MessageContent content={m.content} />
                {m.role === "assistant" && saved && (
                  <>
                    <Sources sources={saved.sources} />
                    <Rating messageId={saved.id} initial={saved.rating} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      >
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask something..."
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
    </div>
  );
}
