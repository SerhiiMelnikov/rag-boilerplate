"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const loaded: ConversationRowData[] = (await res.json()).conversations;
    setItems(loaded);
    // Invariant: a filter is never applied while its input is off screen. Once
    // the list drops below the threshold the search box unmounts, so a query
    // left behind would silently keep hiding conversations with no way to see
    // or clear it. Reset it here, where the list that decides searchability is
    // set, rather than in an effect watching the derived `searchable` flag.
    if (loaded.length < SEARCH_THRESHOLD) setQuery("");
  }, []);

  useEffect(() => {
    // A reload triggered from here (mount, or a refreshKey bump such as a
    // completed chat turn) has nothing to do with any earlier failed
    // rename/delete, so that failure's message no longer describes anything
    // on screen. Deliberately not done inside `load()` itself: rename() sets
    // the error and then calls `load()` directly, and clearing it there would
    // wipe the message before the user ever saw it.
    setError(null);
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onSwitch = () => {
      // A filter typed for one workspace has no meaning in another, and
      // neither does an error raised while browsing it.
      setQuery("");
      setError(null);
      void load();
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onSwitch);
  }, [load]);

  async function rename(id: string, title: string) {
    setError(null);
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) setError("Could not rename that conversation.");
    // Reload either way: on success this picks up the new title, and on
    // failure it replaces the row's hopeful local revert with what the server
    // actually has.
    await load();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        await load();
        onDeleted(id);
      } else {
        setError("Could not delete that conversation.");
      }
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

      {error && (
        <div className="px-2 pb-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

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
