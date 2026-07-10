"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

interface UserRow { id: string; email: string; granted: boolean }
interface Props {
  workspace: { id: string; name: string; isDefault: boolean };
  onClose: () => void;
}

// Per-workspace access grants: lists every user with a checkbox reflecting
// their current grant. The default (General) workspace is always accessible
// to everyone, so its checkboxes are read-only.
export function WorkspaceAccessModal({ workspace, onClose }: Props) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/workspaces/${workspace.id}/users`);
    if (res.ok) setUsers((await res.json()).users);
  }, [workspace.id]);
  useEffect(() => { void load(); }, [load]);

  // Allow closing the modal with the Escape key, as expected for dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggle(user: UserRow) {
    if (workspace.isDefault) return;
    setSaving(user.id);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}/users`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, granted: !user.granted }),
      });
      if (res.ok) await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Access to ${workspace.name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="mb-1 text-lg font-semibold">Access to {workspace.name}</h2>
        {workspace.isDefault ? (
          <p className="mb-4 text-sm text-zinc-500">This is the default workspace — everyone has access, and it cannot be changed.</p>
        ) : (
          <p className="mb-4 text-sm text-zinc-500">Grant users access to this workspace. Everyone always keeps access to the default workspace.</p>
        )}

        {!users ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner label="Loading" /> Loading...</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
                <input
                  id={`grant-${u.id}`}
                  type="checkbox"
                  checked={u.granted}
                  disabled={workspace.isDefault || saving === u.id}
                  onChange={() => void toggle(u)}
                  className="h-4 w-4"
                />
                <label htmlFor={`grant-${u.id}`} className="flex-1">{u.email}</label>
                {saving === u.id && <Spinner label="Saving" />}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
