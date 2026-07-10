"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Trash2, ArrowUpDown } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { ImageModal } from "./image-modal";
import { FileWorkspacesModal } from "./file-workspaces-modal";

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
  const [allWorkspaces, setAllWorkspaces] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const [uploadWorkspaceIds, setUploadWorkspaceIds] = useState<string[]>([]);
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
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
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Files</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          {busy ? <Spinner label="Uploading" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading..." : "Upload file"}
          <input ref={fileInputRef} type="file" accept={ACCEPT} aria-label="Upload file" onChange={upload} className="hidden" disabled={busy} />
        </label>
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
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2"><button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></button></th>
            <th>Type</th>
            <th>Status</th>
            <th><button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></button></th>
            <th>Workspaces</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((f) => (
            <tr key={f.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">
                {f.kind === "image" ? (
                  <button type="button" onClick={() => setModalImage(f)} className="text-left underline-offset-2 hover:underline">{f.filename}</button>
                ) : (
                  f.filename
                )}
              </td>
              <td><span className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{f.ext || "—"}</span></td>
              <td><StatusBadge status={f.status} error={f.error} /></td>
              <td className="text-xs text-zinc-500">{new Date(f.createdAt).toLocaleDateString()}</td>
              <td>
                <button
                  type="button"
                  aria-label={`Edit workspaces of ${f.filename}`}
                  onClick={() => setWsFor(f)}
                  className="flex flex-wrap items-center gap-1"
                >
                  {f.workspaces.length === 0 ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">unassigned</span>
                  ) : (
                    f.workspaces.map((w) => (
                      <span key={w.id} className="rounded bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{w.name}</span>
                    ))
                  )}
                </button>
              </td>
              <td className="text-right">
                <button type="button" aria-label={`Delete ${f.filename}`} onClick={() => setPendingDelete(f)} className="text-zinc-400 transition-colors hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "processing" || status === "pending") return <span className="flex items-center gap-1.5 text-zinc-500"><Spinner label="Processing" /> {status}</span>;
  if (status === "error") return <span className="text-red-600" title={error ?? undefined}>error</span>;
  return <span className="text-green-600 dark:text-green-500">ready</span>;
}
