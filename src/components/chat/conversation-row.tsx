"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConversationRowData {
  id: string;
  title: string;
  createdAt: string;
}

export function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationRowData;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  // Escape unmounts the input, and unmounting fires blur. Without this flag the blur
  // handler would commit the edit the user just abandoned.
  const cancelled = useRef(false);

  function startEditing() {
    setDraft(conversation.title);
    cancelled.current = false;
    setEditing(true);
  }

  function commit() {
    if (cancelled.current) return;
    const title = draft.trim();
    setEditing(false);
    // An unchanged or emptied title is not a rename; the server would reject the
    // second case anyway, and the first is a wasted round trip.
    if (title && title !== conversation.title) onRename(title);
  }

  if (editing) {
    return (
      <li className="px-1 py-1">
        <Input
          autoFocus
          value={draft}
          aria-label="Conversation title"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded px-2 text-sm transition-colors",
        active ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn("min-w-0 flex-1 truncate py-2.5 text-left md:py-2", FOCUS_RING)}
      >
        {conversation.title}
      </button>
      <RowAction label={`Rename ${conversation.title}`} icon={Pencil} onClick={startEditing} />
      <RowAction label={`Delete ${conversation.title}`} icon={Trash2} onClick={onDelete} danger />
    </li>
  );
}

function RowAction({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded p-1 text-ink-subtle",
        danger ? "hover:text-danger" : "hover:text-ink",
        // Always present on touch, revealed on hover once there is a pointer.
        "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
        FOCUS_RING,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
