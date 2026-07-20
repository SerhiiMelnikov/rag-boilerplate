"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <button type="button" onClick={newChat} className="m-2 flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
        <Plus className="h-4 w-4" /> New chat
      </button>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {items.map((c) => (
          <li key={c.id} className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors ${c.id === activeId ? "bg-zinc-200 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}>
            <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 truncate text-left">
              {c.title}
            </button>
            <button type="button" aria-label={`Delete ${c.title}`} onClick={() => setPendingDelete(c)} className="ml-2 hidden text-zinc-400 transition-colors hover:text-red-600 group-hover:block">
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
    </aside>
  );
}
