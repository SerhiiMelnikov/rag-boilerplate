"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Loading } from "@/components/ui/loading";

interface ChunkRow {
  chunkIndex: number | null;
  content: string;
  contentHash: string;
}

interface Props {
  doc: { id: string; filename: string };
  onClose: () => void;
}

const PAGE_SIZE = 50;

// Paged chunk preview for a single document (Task 5). Mirrors FileWorkspacesModal:
// same click-outside-to-close backdrop, same Escape handling, same panel chrome.
//
// NOT migrated to the shared Dialog (Task 15): its existing test asserts that
// clicking the element with role="dialog" does not close the modal while clicking
// that element's parent does — pinning a backdrop-click contract only satisfiable by
// this hand-rolled overlay. The shared Dialog delegates outside-click detection to
// Headless UI's useOutsideClick, which listens for pointerdown/pointerup, not click,
// so a bare fireEvent.click (as the test uses) never reaches it and the assertion
// fails. Reusing Dialog here would require editing that test, which is out of scope.
export function ChunksModal({ doc, onClose }: Props) {
  const [rows, setRows] = useState<ChunkRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextOffset: number) => {
    setRows(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/chunks?limit=${PAGE_SIZE}&offset=${nextOffset}`);
      if (!res.ok) {
        setError("Could not load chunks.");
        setRows([]);
        return;
      }
      const data: { rows: ChunkRow[]; total: number } = await res.json();
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      setError("Could not load chunks.");
      setRows([]);
    }
  }, [doc.id]);

  useEffect(() => { void load(offset); }, [load, offset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A legacy chunk (ingested before position tracking) has chunkIndex: null. Rows are
  // never renumbered 1..n to fill the gap — that would present arbitrary store order
  // as document order, exactly the lie this feature exists to prevent.
  const hasUnknownOrder = (rows ?? []).some((r) => r.chunkIndex === null);
  const rangeEnd = rows ? Math.min(offset + rows.length, total) : offset;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chunks for ${doc.filename}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded border border-border bg-surface p-5"
      >
        <h2 className="mb-1 text-lg font-semibold text-ink">Chunks for {doc.filename}</h2>

        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

        {!rows ? (
          <Loading inline />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-muted">This document has no chunks yet.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-muted">Showing {offset + 1}–{rangeEnd} of {total}</p>
            {hasUnknownOrder && (
              <p className="mb-3 rounded bg-warning-soft px-2 py-1 text-sm text-warning">
                Order unknown: this document was ingested before chunk position was recorded, so these rows are not
                guaranteed to be in document order.
              </p>
            )}
            <Table>
              <THead>
                <TR>
                  <TH numeric>Position</TH>
                  <TH numeric>Characters</TH>
                  <TH>Content</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <TR key={`${r.contentHash}-${i}`} className="align-top">
                    <TD numeric>{r.chunkIndex === null ? "Unknown" : r.chunkIndex}</TD>
                    <TD numeric>{r.content.length.toLocaleString("en-US")}</TD>
                    <TD className="whitespace-pre-wrap">{r.content}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!rows || offset + rows.length >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
