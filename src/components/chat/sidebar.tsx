"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";

interface ConversationRow {
  id: string;
  title: string;
  createdAt: string;
}

export function Sidebar({
  activeId, onSelect, onNew, onDeleted, refreshKey = 0,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (id: string) => void;
  onDeleted: (id: string) => void;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [pendingDelete, setPendingDelete] = useState<ConversationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) setItems((await res.json()).conversations);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onSwitch = () => void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
  }, [load]);

  async function newChat() {
    const res = await fetch("/api/conversations", { method: "POST" });
    if (res.ok) {
      const created = await res.json();
      await load();
      onNew(created.id);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setDeleting(true);
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      await load();
      onDeleted(id);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Button onClick={newChat} className="m-2 w-[calc(100%-1rem)]">
        <Plus className="h-4 w-4" /> New chat
      </Button>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {items.map((c) => (
          <li
            key={c.id}
            className={cn(
              "group flex items-center justify-between rounded px-2 py-2.5 text-sm transition-colors md:py-2",
              c.id === activeId ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface-2",
            )}
          >
            <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 truncate text-left">
              {c.title}
            </button>
            <button
              type="button"
              aria-label={`Delete ${c.title}`}
              onClick={() => setPendingDelete(c)}
              className={cn(
                "ml-2 rounded p-1 text-ink-subtle hover:text-danger",
                // Always present on touch, revealed on hover once there is a pointer.
                "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                FOCUS_RING,
              )}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete conversation?"
        description={pendingDelete ? `"${pendingDelete.title}" and its messages will be permanently removed.` : undefined}
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
