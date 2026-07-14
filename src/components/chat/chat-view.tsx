"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { MessageContent } from "./message-content";
import { Sources } from "./sources";
import { Rating } from "./rating";
import { ImageResults } from "./image-results";
import { humanizeChatError } from "./chat-error";

interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: { documentId: string; filename: string; chunkId: string; score: number }[];
  images: { imageId: string; filename: string; score: number }[];
  rating: number | null;
}

export function ChatView({ conversationId, onTurnComplete }: { conversationId: string; onTurnComplete?: () => void }) {
  const [persisted, setPersisted] = useState<PersistedMessage[]>([]);
  const { messages, input, handleInputChange, handleSubmit, status, setMessages, error } = useChat({
    api: "/api/chat",
    body: { conversationId },
  });
  const prevStatus = useRef(status);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (!res.ok) return;
    const data = await res.json();
    const msgs = data.messages ?? [];
    setPersisted(msgs);
    setMessages(msgs.map((m: PersistedMessage) => ({ id: m.id, role: m.role, content: m.content })));
  }, [conversationId, setMessages]);

  // Load existing history when the conversation changes.
  useEffect(() => {
    setPersisted([]);
    void loadHistory();
  }, [loadHistory]);

  // When a streamed turn finishes (status returns to "ready"), refetch persisted data
  // and notify parent so the sidebar title can refresh.
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") {
      void loadHistory().then(() => onTurnComplete?.());
    }
    prevStatus.current = status;
  }, [status, loadHistory, onTurnComplete]);

  const persistedById = new Map(persisted.map((m) => [m.id, m]));

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => {
          const saved = persistedById.get(m.id);
          return (
            <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[80ch] rounded-lg px-3 py-2 ${m.role === "user" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                {/* While the assistant message exists but no token has arrived yet
                    (high time-to-first-token on the model), keep showing a
                    generating indicator instead of an empty bubble. */}
                {m.role === "assistant" && m.content.length === 0 ? (
                  <span className="flex items-center gap-2 text-sm text-zinc-500">
                    <Spinner label="Generating" /> Generating…
                  </span>
                ) : (
                  <MessageContent content={m.content} />
                )}
                {m.role === "assistant" && saved && (
                  <>
                    <ImageResults images={saved.images ?? []} />
                    <Sources sources={saved.sources} />
                    <Rating messageId={saved.id} initial={saved.rating} />
                  </>
                )}
              </div>
            </div>
          );
        })}
        {status === "submitted" && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Spinner label="Thinking" /> Thinking...
          </div>
        )}
      </div>
      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {humanizeChatError(error)}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <input
          value={input} onChange={handleInputChange} placeholder="Ask something..." aria-label="Message"
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
        <button type="submit" aria-label="Send" disabled={status !== "ready"} className="flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-white transition-opacity disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
