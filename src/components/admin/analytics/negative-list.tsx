"use client";

import { Fragment, useState } from "react";
import { Table, TBody, TD, TR } from "@/components/ui/table";
import type { NegativeAnswer } from "@/lib/analytics/feedback";

// Recent downvoted answers; each row expands to show the full Q/A and sources.
export function NegativeList({ items }: { items: NegativeAnswer[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-sm text-ink-muted">No negative feedback yet.</p>;
  return (
    <Table>
      <TBody>
        {items.map((it) => {
          const isOpen = open === it.id;
          return (
            <Fragment key={it.id}>
              <TR>
                <TD>
                  <button type="button" onClick={() => setOpen(isOpen ? null : it.id)} className="w-full text-left">
                    <div className="truncate text-sm font-medium">{it.question ?? "(no preceding question)"}</div>
                    {/* Hide the truncated preview while expanded so it doesn't duplicate the full answer below. */}
                    {!isOpen && <div className="truncate text-xs text-ink-muted">{it.answer}</div>}
                  </button>
                </TD>
              </TR>
              {isOpen && (
                <TR>
                  <TD className="pt-0">
                    <div className="space-y-1 text-sm">
                      <p><span className="text-ink-muted">Q: </span>{it.question ?? "—"}</p>
                      <p><span className="text-ink-muted">A: </span>{it.answer}</p>
                      {it.filenames.length > 0 && (
                        <p className="text-xs text-ink-muted">Sources: {it.filenames.join(", ")}</p>
                      )}
                    </div>
                  </TD>
                </TR>
              )}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
