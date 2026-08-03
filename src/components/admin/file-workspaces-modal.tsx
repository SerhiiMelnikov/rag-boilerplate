"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { Checkbox } from "@/components/ui/checkbox";

interface Workspace { id: string; name: string; isDefault: boolean }
interface Props {
  file: { id: string; kind: "document" | "image"; filename: string; workspaces: Workspace[] };
  onClose: () => void;
  onSaved: () => void;
}

export function FileWorkspacesModal({ file, onClose, onSaved }: Props) {
  const [all, setAll] = useState<Workspace[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set(file.workspaces.map((w) => w.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/workspaces");
    if (!res.ok) return;
    const list: Workspace[] = (await res.json()).workspaces;
    // General first, then alphabetical — the server already orders this way.
    setAll(list);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Preserve the server's ordering so the request is deterministic.
      const workspaceIds = (all ?? []).filter((w) => checked.has(w.id)).map((w) => w.id);
      const res = await fetch(`/api/admin/files/${file.kind}/${file.id}/workspaces`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceIds }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Could not save the workspaces.");
        await load(); // a workspace may have been deleted in another tab
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Workspaces for ${file.filename}`}
      description="A file with no workspaces stays in this list but is never used to answer questions."
      size="md"
    >
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      {!all ? (
        <Loading inline />
      ) : (
        <ul className="flex flex-col gap-1">
          {all.map((w) => (
            <li key={w.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
              <Checkbox id={`ws-${w.id}`} checked={checked.has(w.id)} onChange={() => toggle(w.id)} />
              {/* The "everyone" hint sits outside the <label> so the checkbox's
                  accessible name stays exactly the workspace name. */}
              <label htmlFor={`ws-${w.id}`} className="flex-1">{w.name}</label>
              {w.isDefault && <span className="text-xs text-ink-subtle">everyone</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={save} disabled={saving || !all}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </Dialog>
  );
}
