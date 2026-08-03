"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, ArrowUpDown, Layers, Link2, SearchX } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gutter } from "@/components/ui/gutter";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { Pagination, paginate, PAGE_SIZES, DEFAULT_PAGE_SIZE } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";
import { ImageModal } from "./image-modal";
import { FileWorkspacesModal } from "./file-workspaces-modal";
import { ChunksModal } from "./chunks-modal";

interface FileRow {
  id: string;
  kind: "document" | "image";
  filename: string;
  ext: string;
  status: string;
  error?: string | null;
  caption?: string | null;
  createdAt: string;
  workspaces: { id: string; name: string; isDefault: boolean }[];
}

const POLL_INTERVAL_MS = 2500;
const DOC_ACCEPT = ".pdf,.docx,.md,.txt,.markdown";
const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";
const ACCEPT = `${DOC_ACCEPT},${IMAGE_TYPES}`;
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type SortKey = "date" | "name";

// "1 files" is wrong; every other count in the app already avoids this.
function fileCountLabel(n: number): string {
  return `${n} ${n === 1 ? "file" : "files"}`;
}

export function FilesManager() {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extFilter, setExtFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [modalImage, setModalImage] = useState<FileRow | null>(null);
  const [wsFor, setWsFor] = useState<FileRow | null>(null);
  const [chunksFor, setChunksFor] = useState<FileRow | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const [uploadWorkspaceIds, setUploadWorkspaceIds] = useState<string[]>([]);
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [urlValue, setUrlValue] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/files");
    if (res.ok) {
      setFiles((await res.json()).files);
      setLoadError(null);
    } else {
      setLoadError("Could not load the files. Try again.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/workspaces");
      if (!res.ok) return;
      const list: { id: string; name: string; isDefault: boolean }[] = (await res.json()).workspaces;
      setAllWorkspaces(list);
      const def = list.find((w) => w.isDefault);
      if (def) setUploadWorkspaceIds([def.id]);
    })();
  }, []);

  const hasProcessing = (files ?? []).some((f) => f.status === "processing" || f.status === "pending");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasProcessing, load]);

  const exts = useMemo(() => [...new Set((files ?? []).map((f) => f.ext).filter(Boolean))].sort(), [files]);
  const visible = useMemo(() => {
    const all = files ?? [];
    const q = query.trim().toLowerCase();
    const byName = q === "" ? all : all.filter((f) => f.filename.toLowerCase().includes(q));
    const filtered = extFilter === "all" ? byName : byName.filter((f) => f.ext === extFilter);
    const byWorkspace = workspaceFilter === "all"
      ? filtered
      : workspaceFilter === "unassigned"
        ? filtered.filter((f) => f.workspaces.length === 0)
        : filtered.filter((f) => f.workspaces.some((w) => w.name === workspaceFilter));
    const sorted = [...byWorkspace].sort((a, b) =>
      sortKey === "name"
        ? a.filename.localeCompare(b.filename)
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return sortAsc ? sorted : sorted.reverse();
  }, [files, query, extFilter, workspaceFilter, sortKey, sortAsc]);
  const paged = paginate(visible, page, pageSize);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const endpoint = IMAGE_MIME.has(file.type) ? "/api/admin/images" : "/api/admin/documents";
      const form = new FormData();
      form.set("file", file);
      // One entry per id; a single empty entry means "explicitly no workspaces",
      // which the handler distinguishes from the field being absent.
      if (uploadWorkspaceIds.length === 0) form.append("workspaceIds", "");
      else for (const id of uploadWorkspaceIds) form.append("workspaceIds", id);
      await fetch(endpoint, { method: "POST", body: form });
      await load();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  // POST /api/admin/documents/url creates the document row synchronously (status
  // "processing"), so — exactly like upload() above — a single load() after the
  // request resolves is enough to show it; there is nothing to poll for here beyond
  // the existing hasProcessing interval.
  async function ingestUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = urlValue.trim();
    if (!url) return;
    setUrlBusy(true);
    setUrlError(null);
    try {
      const res = await fetch("/api/admin/documents/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, workspaceIds: uploadWorkspaceIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : "Could not ingest that URL.";
        setUrlError(message);
        return;
      }
      setUrlValue("");
      await load();
    } finally {
      setUrlBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const base = pendingDelete.kind === "image" ? "/api/admin/images" : "/api/admin/documents";
      await fetch(`${base}/${pendingDelete.id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "name"); // names default A→Z, dates default newest-first
    }
  }

  // Every filter, not just the one the admin last touched: an empty result can be
  // the product of all three at once, and clearing one still shows nothing.
  function clearFilters() {
    setQuery("");
    setExtFilter("all");
    setWorkspaceFilter("all");
  }

  const header = (
    <PageHeader
      className="mx-auto w-full max-w-6xl"
      title="Files"
      description="Everything the assistant can read. A file answers questions only in the workspaces it belongs to."
      actions={
        // flex-wrap (+ justify-end so a wrapped second line still hugs the
        // right edge like the first) is what actually does the wrapping:
        // PageHeader's own actions wrapper only ever receives this single
        // div as its one child, so flex-wrap there has nothing to wrap
        // between. This is the flex container that actually holds more
        // than one item -- the upload control and the "Upload to" group --
        // so this is where they can drop onto separate lines on a narrow
        // viewport instead of forcing the header to overflow sideways.
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded border border-border-strong px-3 py-2 text-sm transition-colors hover:bg-surface-2",
              // The input itself carries the ring, not this label: a `hidden` input
              // is unfocusable and not in the tab order, so a ring drawn on it would
              // never be visible to the keyboard user it exists for. `focus-within`
              // makes the label draw the ring when its `sr-only` input takes focus.
              "outline-none focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
            )}
          >
            {busy ? <Spinner label="Uploading" /> : <Upload className="h-4 w-4" />}
            {busy ? "Uploading..." : "Upload file"}
            <input ref={fileInputRef} type="file" accept={ACCEPT} aria-label="Upload file" onChange={upload} className="sr-only" disabled={busy} />
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span>Upload to</span>
            <MultiSelect
              ariaLabel="Workspaces for upload"
              value={uploadWorkspaceIds}
              onChange={setUploadWorkspaceIds}
              options={allWorkspaces.map((w) => ({ value: w.id, label: w.name, hint: w.isDefault ? "everyone" : undefined }))}
              // max-w-40 caps how far a long workspace name (this shows the
              // real default workspace's name, not a short placeholder) can
              // push the header wide; MultiSelect's own trigger truncates
              // the label instead of growing past this.
              className="min-w-36 max-w-40"
            />
          </div>
        </div>
      }
    />
  );

  // The frame first, the data into it — the same rule the other five screens
  // follow. This was the one still returning a bare block instead of its header,
  // so the largest and slowest admin screen showed a lone spinner and then popped
  // title, filters and table in together.
  if (files === null) {
    return (
      <>
        {header}
        <PageBody className="mx-auto w-full max-w-6xl">
          {loadError ? <Alert tone="danger">{loadError}</Alert> : <Loading label="Loading files" />}
        </PageBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PageBody className="mx-auto w-full max-w-6xl space-y-4">
        {/* Its own row, not a filter: the URL box is a second way to add a file, so it
            sits with the other actions rather than inside files-filters below. */}
        <div data-testid="files-ingest" className="flex items-center gap-2">
          {/* noValidate: bad input is reported by our own error state (from the
              server's validation), not the browser's native url-constraint popup —
              keeps the failure path consistent with every other error in this form. */}
          <form onSubmit={ingestUrl} noValidate className="flex items-center gap-2">
            <input
              type="url"
              aria-label="Ingest from URL"
              placeholder="Paste a URL to ingest"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              disabled={urlBusy}
              className={cn("rounded border border-border-strong bg-transparent px-3 py-2 text-sm", FOCUS_RING)}
            />
            <Button type="submit" variant="secondary" disabled={urlBusy || urlValue.trim() === ""}>
              {urlBusy ? <Spinner label="Ingesting" /> : <Link2 className="h-4 w-4" />}
              {urlBusy ? "Ingesting..." : "Ingest URL"}
            </Button>
          </form>
        </div>
        {urlError && <Alert tone="danger">{urlError}</Alert>}
        {files.length > 0 && (
          <div data-testid="files-filters" className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search files"
              placeholder="Search by name"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Type</span>
              <Select ariaLabel="Filter by type" value={extFilter} onChange={(v) => { setExtFilter(v); setPage(1); }} options={["all", ...exts]} className="min-w-28" />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Workspace</span>
              <Select
                ariaLabel="Filter by workspace"
                value={workspaceFilter}
                onChange={(v) => { setWorkspaceFilter(v); setPage(1); }}
                options={["all", ...allWorkspaces.map((w) => w.name), "unassigned"]}
                className="min-w-32"
              />
            </div>
            <span className="ml-auto text-xs text-ink-muted">
              {visible.length === files.length ? fileCountLabel(files.length) : `${visible.length} of ${fileCountLabel(files.length)}`}
            </span>
          </div>
        )}
        {visible.length === 0 ? (
          files.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="No files yet"
              description="Upload a document or an image, or paste a URL to ingest a page. Nothing can be answered until something is here."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No files match"
              description="No file matches every active filter."
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>
              }
            />
          )
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>
                  <button type="button" onClick={() => toggleSort("name")} className={cn("inline-flex items-center gap-1", FOCUS_RING)}>
                    Name <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>
                  <button type="button" onClick={() => toggleSort("date")} className={cn("inline-flex items-center gap-1", FOCUS_RING)}>
                    Date <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TH>
                <TH>Workspaces</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {paged.rows.map((f) => (
                <TR key={f.id}>
                  {/* min-w-32 (8rem): `truncate` sets this cell's own min-content to zero
                      (overflow:hidden removes it from the intrinsic-size calculation), so
                      without a floor it is the first column squeezed away on a narrow
                      viewport — exactly backwards, since the name is what identifies the
                      row. Pre-truncate, the longest unbreakable segment of a filename kept
                      it legible; this restores a comparable floor explicitly. The table
                      itself still scrolls (see Table's own overflow-x-auto), so this only
                      changes how much of that scroll area the name column claims first. */}
                  {/* max-w bounds the column so a long name ellipsizes instead of widening
                      the table until it scrolls; `title` keeps the whole name readable on
                      hover, which matters most for the URL-ingested rows that are longest. */}
                  <TD className="min-w-32 max-w-[22rem]">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* The name cell is where a file's grounding in the knowledge base
                          shows up: one tick per workspace it belongs to, dashed when none.
                          The workspaces cell below still carries the count as text. */}
                      <Gutter sources={f.workspaces.length} size="sm" />
                      {f.kind === "image" ? (
                        <button type="button" title={f.filename} onClick={() => setModalImage(f)} className={cn("truncate text-left underline-offset-2 hover:underline", FOCUS_RING)}>
                          {f.filename}
                        </button>
                      ) : (
                        <span className="truncate" title={f.filename}>{f.filename}</span>
                      )}
                    </div>
                  </TD>
                  {/* Bounded on purpose: extOf now refuses to call a URL path an extension, but a
                      badge that can grow without limit is what let one bad row widen the whole table. */}
                  <TD><Badge className="max-w-24 truncate">{f.ext || "—"}</Badge></TD>
                  <TD><StatusBadge status={f.status} error={f.error} /></TD>
                  <TD className="text-xs text-ink-muted">{new Date(f.createdAt).toLocaleDateString()}</TD>
                  <TD>
                    <button
                      type="button"
                      aria-label={`Edit workspaces of ${f.filename}`}
                      onClick={() => setWsFor(f)}
                      className={cn("flex flex-wrap items-center gap-1", FOCUS_RING)}
                    >
                      {f.workspaces.length === 0 ? (
                        <Badge dashed>unassigned</Badge>
                      ) : (
                        f.workspaces.map((w) => <Badge key={w.id}>{w.name}</Badge>)
                      )}
                    </button>
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      {f.kind === "document" && (
                        <button
                          type="button"
                          aria-label={`View chunks of ${f.filename}`}
                          title="View chunks"
                          onClick={() => setChunksFor(f)}
                          className={cn("text-ink-subtle transition-colors hover:text-ink", FOCUS_RING)}
                        >
                          <Layers className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${f.filename}`}
                        title="Delete"
                        onClick={() => setPendingDelete(f)}
                        className={cn("text-ink-subtle transition-colors hover:text-danger", FOCUS_RING)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {visible.length > PAGE_SIZES[0] && (
          <Pagination
            total={visible.length}
            page={paged.page}
            pageCount={paged.pageCount}
            from={paged.from}
            to={paged.to}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            noun="files"
          />
        )}
      </PageBody>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete file?"
        description={pendingDelete ? `"${pendingDelete.filename}" and its indexed data will be permanently removed.` : undefined}
        confirmLabel="Delete"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {modalImage && (
        <ImageModal
          image={{ id: modalImage.id, filename: modalImage.filename, caption: modalImage.caption ?? "", status: modalImage.status }}
          onClose={() => setModalImage(null)}
          onSaved={() => { setModalImage(null); void load(); }}
        />
      )}
      {wsFor && (
        <FileWorkspacesModal
          file={{ id: wsFor.id, kind: wsFor.kind, filename: wsFor.filename, workspaces: wsFor.workspaces }}
          onClose={() => setWsFor(null)}
          onSaved={() => { setWsFor(null); void load(); }}
        />
      )}
      {chunksFor && (
        <ChunksModal
          doc={{ id: chunksFor.id, filename: chunksFor.filename }}
          onClose={() => setChunksFor(null)}
        />
      )}
    </>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "processing" || status === "pending") {
    return (
      <Badge tone="warning">
        <Spinner label="Processing" /> {status}
      </Badge>
    );
  }
  if (status === "error") {
    // Badge doesn't forward a `title`, so the tooltip lives on a wrapping span instead.
    return (
      <span title={error ?? undefined}>
        <Badge tone="danger">error</Badge>
      </span>
    );
  }
  return <Badge tone="success">ready</Badge>;
}
