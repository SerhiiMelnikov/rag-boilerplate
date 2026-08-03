"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "./select";
import { Button } from "./button";

export const PAGE_SIZES = [10, 20, 30, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

// The slice a page shows, with the page clamped into range as it is computed.
//
// Clamping here rather than in an effect is the point: a filter that shortens the
// list while the admin is on page 4 would otherwise leave them on an empty page
// with no control to get back — the table renders nothing, and "next" and
// "previous" are both dead. Deriving the safe page every render makes that state
// unreachable instead of something to remember to repair.
export function paginate<T>(items: T[], page: number, pageSize: number): {
  rows: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
} {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  const start = (safe - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page: safe,
    pageCount,
    // 1-based and inclusive, and 0–0 when there is nothing — "1–0 of 0" is worse
    // than saying nothing, so callers hide the whole bar on an empty list.
    from: items.length === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}

export function Pagination({
  total,
  page,
  pageCount,
  from,
  to,
  pageSize,
  onPage,
  onPageSize,
  noun,
}: {
  total: number;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** Plural, lowercase — "files", "accounts", "workspaces". */
  noun: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
      <span>
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          Per page
          <Select
            compact
            ariaLabel="Rows per page"
            value={String(pageSize)}
            onChange={(v) => {
              onPageSize(Number(v));
              // Back to the first page: page 4 of a 10-per-page list is past the end
              // of the same list at 50 per page, and landing on an empty page after
              // asking to see *more* is the opposite of what was asked for.
              onPage(1);
            }}
            options={PAGE_SIZES.map(String)}
            className="w-20"
          />
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Previous page"
            title="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Next page"
            title="Next page"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
