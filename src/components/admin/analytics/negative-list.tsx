"use client";

import { useState } from "react";
import type { NegativeAnswer } from "@/lib/analytics/feedback";

// Recent downvoted answers; each row expands to show the full Q/A and sources.
export function NegativeList({ items }: { items: NegativeAnswer[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-sm text-zinc-500">No negative feedback yet.</p>;
  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {items.map((it) => {
        const isOpen = open === it.id;
        return (
          <li key={it.id} className="py-2">
            <button type="button" onClick={() => setOpen(isOpen ? null : it.id)} className="w-full text-left">
              <div className="truncate text-sm font-medium">{it.question ?? "(no preceding question)"}</div>
              {/* Hide the truncated preview while expanded so it doesn't duplicate the full answer below. */}
              {!isOpen && <div className="truncate text-xs text-zinc-500">{it.answer}</div>}
            </button>
            {isOpen && (
              <div className="mt-2 space-y-1 text-sm">
                <p><span className="text-zinc-500">Q: </span>{it.question ?? "—"}</p>
                <p><span className="text-zinc-500">A: </span>{it.answer}</p>
                {it.filenames.length > 0 && (
                  <p className="text-xs text-zinc-500">Sources: {it.filenames.join(", ")}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
