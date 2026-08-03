"use client";

import { useCallback, useEffect, useState } from "react";
import { SearchX, Users } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";

interface UserRow { id: string; email: string; granted: boolean }
interface Props {
  workspace: { id: string; name: string; isDefault: boolean };
  onClose: () => void;
}

// Same threshold as the Users screen and the conversation list: a box on a short
// list is clutter, and no box on a long one is a missing feature.
const SEARCH_THRESHOLD = 8;

// Per-workspace access grants: lists every user with a checkbox reflecting
// their current grant. The default (General) workspace is always accessible
// to everyone, so its checkboxes are read-only.
export function WorkspaceAccessModal({ workspace, onClose }: Props) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

  const searchable = (users?.length ?? 0) >= SEARCH_THRESHOLD;
  const visible = users && searchable && query.trim() !== ""
    ? users.filter((u) => u.email.toLowerCase().includes(query.trim().toLowerCase()))
    : users;

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
      {!users || !visible ? (
        <Loading inline label="Loading accounts" />
      ) : (
        <div className="flex flex-col gap-3">
          {/* On an install with a hundred accounts this list was a wall of identical
              addresses with no way to find one. The count says how much of it is
              already granted, which is the question an admin opens this to answer. */}
          <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
            <span>{users.filter((u) => u.granted).length} of {users.length} have access</span>
            {searchable && query.trim() !== "" && <span>{visible.length} shown</span>}
          </div>

          {searchable && (
            <Input
              aria-label="Search accounts"
              placeholder="Search by email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          {visible.length === 0 ? (
            users.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No accounts yet"
                description="Nobody has registered, so there is no one to grant access to."
              />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No accounts match"
                description="No email contains that text."
                action={<Button variant="secondary" size="sm" onClick={() => setQuery("")}>Clear search</Button>}
              />
            )
          ) : (
            <ul className="flex flex-col">
              {visible.map((u) => (
                <li key={u.id} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-surface-2">
                  <Checkbox
                    id={`grant-${u.id}`}
                    checked={u.granted}
                    disabled={workspace.isDefault || saving === u.id}
                    onChange={() => void toggle(u)}
                  />
                  <label htmlFor={`grant-${u.id}`} className="min-w-0 flex-1 truncate" title={u.email}>
                    {u.email}
                  </label>
                  {saving === u.id && <Spinner label="Saving" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
