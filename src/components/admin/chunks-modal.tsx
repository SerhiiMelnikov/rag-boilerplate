"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

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
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chunks for ${doc.filename}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="mb-1 text-lg font-semibold">Chunks for {doc.filename}</h2>

        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

        {!rows ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner label="Loading" /> Loading...</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-zinc-500">This document has no chunks yet.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-500">Showing {offset + 1}–{rangeEnd} of {total}</p>
            {hasUnknownOrder && (
              <p className="mb-3 rounded bg-amber-100 px-2 py-1 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Order unknown: this document was ingested before chunk position was recorded, so these rows are not
                guaranteed to be in document order.
              </p>
            )}
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-1 pr-3">Position</th>
                  <th className="py-1 pr-3">Characters</th>
                  <th className="py-1">Content</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.contentHash}-${i}`} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.chunkIndex === null ? "Unknown" : r.chunkIndex}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.content.length.toLocaleString("en-US")}</td>
                    <td className="whitespace-pre-wrap py-2">{r.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!rows || offset + rows.length >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
