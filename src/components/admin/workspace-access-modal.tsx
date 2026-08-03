"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loading";

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
    <Dialog
      open
      onClose={onClose}
      title={`Access to ${workspace.name}`}
      description={
        workspace.isDefault
          ? "This is the default workspace — everyone has access, and it cannot be changed."
          : "Grant users access to this workspace. Everyone always keeps access to the default workspace."
      }
      size="md"
    >
      {!users ? (
        <Loading inline />
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
    </Dialog>
  );
}
