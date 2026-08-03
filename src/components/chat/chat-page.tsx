"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";
import { Panel } from "@/components/shell/panel";
import { MobileHeader } from "@/components/shell/mobile-header";
import { usePanel } from "@/components/shell/panel-context";

// What ChatView is mounted with. `focus` rides along inside the session rather than
// beside it so that it is always a mount-scoped value: every transition that re-keys
// ChatView states its own focus intent, and only "New chat" ever raises it. A signal
// left standing across a remount would put the cursor in the composer — on a phone,
// open the keyboard — for someone who only opened a conversation.
interface Session {
  key: number;
  id: string | null;
  focus: number;
}

// Composition: the conversation list in the panel, the transcript and composer in the
// main column.
//
// Two pieces of state, deliberately: `session` is what ChatView is mounted with, and
// `activeId` is what the list highlights. Selecting a conversation bumps session.key
// so ChatView remounts and loads that history. When ChatView creates a conversation
// itself, only activeId moves — bumping the key there would remount the component
// mid-stream and discard the answer arriving into it.
export function ChatPage() {
  const [session, setSession] = useState<Session>({ key: 0, id: null, focus: 0 });
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
    setSession((s) => ({ key: s.key + 1, id, focus: 0 }));
    setActiveId(id);
    setPanelOpen(false);
  }

  function newChat() {
    // "New chat" clears the selection *and* focuses the composer. The second half
    // cannot go through open(): with nothing selected that takes its id === activeId
    // early return — the guard that keeps a re-selection from discarding a streaming
    // answer — and the button would do nothing at all. So the focus request is raised
    // here, and the session is only re-keyed when there is actually a conversation to
    // clear. Bumping the key unconditionally would remount ChatView and throw away a
    // draft the user has already typed.
    setSession((s) =>
      activeId === null
        ? { ...s, focus: s.focus + 1 }
        : { key: s.key + 1, id: null, focus: s.focus + 1 },
    );
    setActiveId(null);
    setPanelOpen(false);
  }

  // Switching the active workspace invalidates the open chat: a conversation belongs
  // to exactly one workspace, so keeping it open across a switch would show a chat
  // that no longer belongs to the visible list.
  useEffect(() => {
    const onSwitch = () => {
      // Re-keyed only when there is a conversation to clear, for the same reason
      // newChat() above is: remounting ChatView throws away whatever is in the
      // composer, and with nothing open there is nothing a switch needs to clear.
      // This matters more since the rail's home link became a third caller — it
      // fires on every click, including one where the user is already home with a
      // half-typed question and expects nothing to happen.
      setSession((s) => (s.id === null ? s : { key: s.key + 1, id: null, focus: 0 }));
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
          onNew={newChat}
          onDeleted={(id) => {
            // Eject from a deleted conversation without closing the panel: the user
            // is still in the list, probably about to pick another one.
            if (id !== activeId) return;
            setSession((s) => ({ key: s.key + 1, id: null, focus: 0 }));
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
          focusSignal={session.focus}
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
