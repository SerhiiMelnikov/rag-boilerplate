"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";
import { groupConversations } from "./group-conversations";
import { ConversationRow, type ConversationRowData } from "./conversation-row";

// Below this a search box is furniture, not help.
const SEARCH_THRESHOLD = 8;

export function ConversationList({
  activeId,
  onSelect,
  onNew,
  onDeleted,
  refreshKey = 0,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<ConversationRowData[]>([]);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ConversationRowData | null>(null);
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

  async function rename(id: string, title: string) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) await load();
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

  const needle = query.trim().toLowerCase();
  const filtered = needle ? items.filter((c) => c.title.toLowerCase().includes(needle)) : items;
  // The threshold reads the full list, not the filtered one, so the box does not
  // disappear from under the cursor as the results narrow.
  const searchable = items.length >= SEARCH_THRESHOLD;
  const groups = groupConversations(filtered, new Date());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 p-2">
        <Button onClick={onNew} className="w-full">
          <Plus className="h-4 w-4" /> New chat
        </Button>
        {searchable && (
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search conversations"
            placeholder="Search"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-6 text-sm text-ink-muted">
            {items.length === 0 ? "No conversations yet." : "No matches."}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.key}>
            <p className="px-2 pb-1 pt-3 text-2xs uppercase text-ink-subtle">{group.label}</p>
            <ul>
              {group.items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onSelect={() => onSelect(c.id)}
                  onRename={(title) => void rename(c.id, title)}
                  onDelete={() => setPendingDelete(c)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete conversation?"
        description={
          pendingDelete ? `"${pendingDelete.title}" and its messages will be permanently removed.` : undefined
        }
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
