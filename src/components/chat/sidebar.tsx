"use client";

import { useCallback, useEffect, useState } from "react";

interface ConversationRow {
  id: string;
  title: string;
  createdAt: string;
}

export function Sidebar({
  activeId, onSelect, onNew, refreshKey = 0,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (id: string) => void;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<ConversationRow[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) setItems((await res.json()).conversations);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function newChat() {
    const res = await fetch("/api/conversations", { method: "POST" });
    if (res.ok) {
      const created = await res.json();
      await load();
      onNew(created.id);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 dark:border-zinc-800">
      <button type="button" onClick={newChat} className="m-2 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
        + New chat
      </button>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {items.map((c) => (
          <li key={c.id} className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm ${c.id === activeId ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}>
            <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 truncate text-left">
              {c.title}
            </button>
            <button type="button" aria-label={`Delete ${c.title}`} onClick={() => remove(c.id)} className="ml-2 hidden text-zinc-400 group-hover:block">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
