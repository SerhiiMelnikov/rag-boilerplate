"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConversationRowData {
  id: string;
  title: string;
  createdAt: string;
}

// Whether a finished edit is a rename, and what to rename to. Pure, because the
// wiring around it cannot be tested here: jsdom does not fire blur when a focused
// element is removed, so the Escape-then-unmount path this guards is only
// observable in a real browser. The rule itself is testable, so it is tested.
export function renameIntent(draft: string, current: string, cancelled: boolean): string | null {
  if (cancelled) return null;
  const title = draft.trim();
  if (!title || title === current) return null;
  return title;
}

// The day the conversation started, as YYYY-MM-DD, or null when createdAt cannot be
// read. Not localized: this string disambiguates two rows that share a title, it is
// not read as prose, and a locale-formatted date would differ between server and
// client rendering and trigger a hydration mismatch.
//
// The null case is the contract groupConversations already keeps: it buckets an
// unparseable createdAt under "Earlier" rather than dropping the conversation, so
// the row it renders has to survive that same value. toISOString() throws RangeError
// on an Invalid Date, and one such row would take the entire list down with it.
function startedOn(createdAt: string): string | null {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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
  // Whether this edit session has already produced its one commit. Enter calls
  // commit() directly and then unmount-blur calls it again with the same draft; this
  // flag makes the second call a no-op instead of a duplicate onRename.
  const settled = useRef(false);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  // Set only by the Enter and Escape keydown paths, never by blur (tab-away and
  // click-away already move focus somewhere the user chose; refocusing here would
  // fight that).
  const refocus = useRef(false);

  useEffect(() => {
    // Enter and Escape unmount the focused input from a keydown handler, which drops
    // focus to <body> in a real browser with nothing to restore it; jsdom cannot
    // exercise this either, so it is verified by hand.
    if (!editing && refocus.current) {
      refocus.current = false;
      selectButtonRef.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    setDraft(conversation.title);
    cancelled.current = false;
    settled.current = false;
    setEditing(true);
  }

  function commit() {
    if (settled.current) return;
    settled.current = true;
    const title = renameIntent(draft, conversation.title, cancelled.current);
    setEditing(false);
    if (title) onRename(title);
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
              refocus.current = true;
              commit();
            }
            if (event.key === "Escape") {
              // jsdom cannot exercise this path (no blur on unmount); the abandon
              // rule itself is covered by renameIntent's own tests below.
              cancelled.current = true;
              refocus.current = true;
              setEditing(false);
            }
          }}
        />
      </li>
    );
  }

  const started = startedOn(conversation.createdAt);
  const label = (verb: string) =>
    started ? `${verb} ${conversation.title}, started ${started}` : `${verb} ${conversation.title}`;

  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded px-2 text-sm transition-colors",
        active ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface-2",
      )}
    >
      <button
        ref={selectButtonRef}
        type="button"
        onClick={onSelect}
        className={cn(
          "min-w-0 flex-1 truncate py-2.5 text-left md:py-2 min-h-11 md:min-h-0",
          FOCUS_RING,
        )}
      >
        {conversation.title}
      </button>
      <RowAction label={label("Rename")} icon={Pencil} onClick={startEditing} />
      <RowAction label={label("Delete")} icon={Trash2} onClick={onDelete} danger />
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
        // The icon is 16px; the hit area is not.
        "min-h-11 min-w-11 md:min-h-8 md:min-w-8",
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
