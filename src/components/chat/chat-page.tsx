"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { ChatView } from "./chat-view";

// Composition: sidebar + the active conversation's chat.
export function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="flex h-full">
      <Sidebar activeId={activeId} onSelect={setActiveId} onNew={setActiveId} />
      <main className="min-w-0 flex-1">
        {activeId ? (
          <ChatView key={activeId} conversationId={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            Start a new chat or pick a conversation.
          </div>
        )}
      </main>
    </div>
  );
}
