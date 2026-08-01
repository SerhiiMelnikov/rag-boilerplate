"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";
import { Panel } from "@/components/shell/panel";
import { MobileHeader } from "@/components/shell/mobile-header";
import { usePanel } from "@/components/shell/panel-context";

// Composition: the conversation list in the panel, the transcript and composer in the
// main column.
//
// Two pieces of state, deliberately: `session` is what ChatView is mounted with, and
// `activeId` is what the list highlights. Selecting a conversation bumps session.key
// so ChatView remounts and loads that history. When ChatView creates a conversation
// itself, only activeId moves — bumping the key there would remount the component
// mid-stream and discard the answer arriving into it.
export function ChatPage() {
  const [session, setSession] = useState<{ key: number; id: string | null }>({ key: 0, id: null });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setOpen: setPanelOpen } = usePanel();

  function open(id: string | null) {
    // Re-selecting the row that is already open must not remount ChatView. The
    // previous composition keyed on activeId, so this was naturally a no-op; a
    // counter that always increments turns "tap the highlighted row to dismiss the
    // drawer" into "discard the answer currently streaming".
    if (id === activeId) {
      setPanelOpen(false);
      return;
    }
    setSession((s) => ({ key: s.key + 1, id }));
    setActiveId(id);
    setPanelOpen(false);
  }

  // Switching the active workspace invalidates the open chat: a conversation belongs
  // to exactly one workspace, so keeping it open across a switch would show a chat
  // that no longer belongs to the visible list.
  useEffect(() => {
    const onSwitch = () => {
      setSession((s) => ({ key: s.key + 1, id: null }));
      setActiveId(null);
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
  }, []);

  return (
    <>
      <Panel label="Conversations">
        <ConversationList
          activeId={activeId}
          onSelect={(id) => open(id)}
          onNew={() => open(null)}
          onDeleted={(id) => {
            // Eject from a deleted conversation without closing the panel: the user
            // is still in the list, probably about to pick another one.
            if (id !== activeId) return;
            setSession((s) => ({ key: s.key + 1, id: null }));
            setActiveId(null);
          }}
          refreshKey={refreshKey}
        />
      </Panel>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileHeader />
        <ChatView
          key={session.key}
          initialConversationId={session.id}
          onStarted={(id) => {
            setActiveId(id);
            setRefreshKey((k) => k + 1);
          }}
          onTurnComplete={() => setRefreshKey((k) => k + 1)}
        />
      </main>
    </>
  );
}
