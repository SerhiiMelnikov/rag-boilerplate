"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { humanizeChatError } from "./chat-error";
import type { PersistedMessage } from "./types";

export function ChatView({
  initialConversationId,
  onStarted,
  onTurnComplete,
}: {
  initialConversationId: string | null;
  onStarted?: (id: string) => void;
  onTurnComplete?: () => void;
}) {
  // A ref, not state: loadHistory is a useCallback the mount effect depends on, so
  // making the id stateful would re-run that effect the moment a conversation is
  // created mid-submit — clearing the messages of the answer streaming into it.
  const conversationRef = useRef<string | null>(initialConversationId);
  const [persisted, setPersisted] = useState<PersistedMessage[]>([]);
  const { messages, input, handleInputChange, handleSubmit, status, setMessages, error } = useChat({
    api: "/api/chat",
  });
  const prevStatus = useRef(status);

  const loadHistory = useCallback(async () => {
    const id = conversationRef.current;
    if (!id) return;
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const msgs: PersistedMessage[] = data.messages ?? [];
    setPersisted(msgs);
    setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
  }, [setMessages]);

  // Load an existing conversation once. ChatPage remounts this component when the
  // user picks a different one, so there is no second load to schedule here.
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // A streamed turn finishing (status back to "ready") is when images, ratings and
  // the source count exist in the database, so that is when history is refetched.
  useEffect(() => {
    if (prevStatus.current !== "ready" && status === "ready") {
      void loadHistory().then(() => onTurnComplete?.());
    }
    prevStatus.current = status;
  }, [status, loadHistory, onTurnComplete]);

  async function submit() {
    let id = conversationRef.current;
    if (!id) {
      // The conversation is born from the first question rather than from a button,
      // so an abandoned "New chat" never leaves an empty row behind.
      const res = await fetch("/api/conversations", { method: "POST" });
      if (!res.ok) return;
      id = (await res.json()).id as string;
      conversationRef.current = id;
      onStarted?.(id);
    }
    handleSubmit(undefined, { body: { conversationId: id } });
  }

  const persistedById = new Map(persisted.map((m) => [m.id, m]));
  const stream = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }));

  return (
    <>
      {stream.length === 0 && status === "ready" && !error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Ask your documents a question"
            description="Type below. Answers cite how many passages they stand on."
          />
        </div>
      ) : (
        <MessageList
          messages={stream}
          persistedById={persistedById}
          pending={status === "submitted"}
          error={error ? humanizeChatError(error) : undefined}
        />
      )}
      <Composer
        value={input}
        onChange={handleInputChange}
        onSubmit={() => void submit()}
        busy={status !== "ready"}
      />
    </>
  );
}
