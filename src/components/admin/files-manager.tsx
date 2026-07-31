"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, ArrowUpDown, Layers, Link2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gutter } from "@/components/ui/gutter";
import { Alert } from "@/components/ui/alert";
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

export function FilesManager() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [extFilter, setExtFilter] = useState("all");
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
    if (res.ok) setFiles((await res.json()).files);
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

  const hasProcessing = files.some((f) => f.status === "processing" || f.status === "pending");
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hasProcessing, load]);

  const exts = useMemo(() => [...new Set(files.map((f) => f.ext).filter(Boolean))].sort(), [files]);
  const visible = useMemo(() => {
    const filtered = extFilter === "all" ? files : files.filter((f) => f.ext === extFilter);
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
  }, [files, extFilter, workspaceFilter, sortKey, sortAsc]);

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
        body: JSON.stringify({ url }),
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

  return (
    <>
      <PageHeader
        title="Files"
        description="Everything the assistant can read. A file answers questions only in the workspaces it belongs to."
      />
      <PageBody className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded border border-border-strong px-3 py-2 text-sm transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            {busy ? <Spinner label="Uploading" /> : <Upload className="h-4 w-4" />}
            {busy ? "Uploading..." : "Upload file"}
            <input ref={fileInputRef} type="file" accept={ACCEPT} aria-label="Upload file" onChange={upload} className="hidden" disabled={busy} />
          </label>
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
            <Button type="submit" variant="secondary" loading={urlBusy} disabled={urlBusy || urlValue.trim() === ""}>
              {urlBusy ? "Ingesting..." : (
                <>
                  <Link2 className="h-4 w-4" /> Ingest URL
                </>
              )}
            </Button>
          </form>
          <div className="flex items-center gap-2 text-sm">
            <span>Type</span>
            <Select ariaLabel="Filter by type" value={extFilter} onChange={setExtFilter} options={["all", ...exts]} className="min-w-28" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Upload to</span>
            <MultiSelect
              ariaLabel="Workspaces for upload"
              value={uploadWorkspaceIds}
              onChange={setUploadWorkspaceIds}
              options={allWorkspaces.map((w) => ({ value: w.id, label: w.name, hint: w.isDefault ? "everyone" : undefined }))}
              className="min-w-36"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Workspace</span>
            <Select
              ariaLabel="Filter by workspace"
              value={workspaceFilter}
              onChange={setWorkspaceFilter}
              options={["all", ...allWorkspaces.map((w) => w.name), "unassigned"]}
              className="min-w-32"
            />
          </div>
        </div>
        {urlError && <Alert tone="danger">{urlError}</Alert>}
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
            {visible.map((f) => (
              <TR key={f.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    {/* The name cell is where a file's grounding in the knowledge base
                        shows up: one tick per workspace it belongs to, dashed when none.
                        The workspaces cell below still carries the count as text. */}
                    <Gutter sources={f.workspaces.length} size="sm" />
                    {f.kind === "image" ? (
                      <button type="button" onClick={() => setModalImage(f)} className={cn("text-left underline-offset-2 hover:underline", FOCUS_RING)}>
                        {f.filename}
                      </button>
                    ) : (
                      f.filename
                    )}
                  </div>
                </TD>
                <TD><Badge>{f.ext || "—"}</Badge></TD>
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
                        onClick={() => setChunksFor(f)}
                        className={cn("text-ink-subtle transition-colors hover:text-ink", FOCUS_RING)}
                      >
                        <Layers className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${f.filename}`}
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
