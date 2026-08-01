"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { ChatView } from "./chat-view";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";
import { Panel } from "@/components/shell/panel";
import { MobileHeader } from "@/components/shell/mobile-header";
import { usePanel } from "@/components/shell/panel-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// Composition: sidebar + the active conversation's chat.
export function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setOpen: setPanelOpen } = usePanel();

  // Eject from a deleted conversation if it was the active one.
  function handleDeleted(id: string) {
    if (id === activeId) setActiveId(null);
  }

  // Switching the active workspace invalidates the open chat: a conversation
  // belongs to exactly one workspace, so keeping it open across a switch would
  // show a chat that no longer belongs to the visible list.
  useEffect(() => {
    const onSwitch = () => setActiveId(null);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
  }, []);

  return (
    <>
      <Panel label="Conversations">
        <Sidebar
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setPanelOpen(false);
          }}
          onNew={(id) => {
            setActiveId(id);
            setPanelOpen(false);
          }}
          onDeleted={handleDeleted}
          refreshKey={refreshKey}
        />
      </Panel>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileHeader />
        {activeId ? (
          <ChatView key={activeId} initialConversationId={activeId} onTurnComplete={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <EmptyState
            title="Ask your documents a question"
            description="Start a new chat, or pick one from the list."
            action={<Button onClick={() => setPanelOpen(true)} className="lg:hidden">Browse conversations</Button>}
          />
        )}
      </main>
    </>
  );
}
