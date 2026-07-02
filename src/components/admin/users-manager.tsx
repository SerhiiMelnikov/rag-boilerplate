"use client";
import { useEffect, useState, useCallback } from "react";

type Row = { id: string; email: string; role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: string | null };

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setRows((await res.json()).users);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) await load();
  }

  if (!rows) return <div className="p-6 text-zinc-500">Loading...</div>;
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Users</h1>
      <ul className="flex flex-col gap-2">
        {rows.map((u) => {
          const locked = u.isSuperAdmin || u.id === currentUserId; // no actions on super-admin or self
          return (
            <li key={u.id} className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <span className="flex items-center gap-2">
                {u.email}
                {u.isSuperAdmin && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">super-admin</span>}
                <span className="text-zinc-500">· {u.role}{u.blockedAt ? " · blocked" : ""}</span>
              </span>
              {!locked && (
                <span className="flex gap-2">
                  <button type="button" aria-label={`toggle role ${u.email}`} onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                    {u.role === "admin" ? "Make user" : "Make admin"}
                  </button>
                  <button type="button" aria-label={`${u.blockedAt ? "unblock" : "block"} ${u.email}`} onClick={() => patch(u.id, { blocked: !u.blockedAt })} className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">
                    {u.blockedAt ? "Unblock" : "Block"}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
