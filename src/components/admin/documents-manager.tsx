"use client";

import { useCallback, useEffect, useState } from "react";

interface DocRow {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
}

export function DocumentsManager() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/documents");
    if (res.ok) setDocs((await res.json()).documents);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      await fetch("/api/admin/documents", { method: "POST", body: form });
      await load();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>
      <label className="mb-4 inline-block cursor-pointer rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
        {busy ? "Uploading..." : "Upload document"}
        <input
          type="file"
          accept=".pdf,.docx,.md,.txt,.markdown"
          aria-label="Upload document"
          onChange={upload}
          className="hidden"
          disabled={busy}
        />
      </label>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className="py-2">File</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2">{d.filename}</td>
              <td>{d.status}</td>
              <td className="text-right">
                <button
                  type="button"
                  aria-label={`Delete ${d.filename}`}
                  onClick={() => remove(d.id)}
                  className="text-zinc-400"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
