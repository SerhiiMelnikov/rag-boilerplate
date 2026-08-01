"use client";
import { useEffect, useState, useCallback } from "react";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  if (!rows) return <div className="p-6 text-ink-muted">Loading...</div>;
  return (
    <>
      <PageHeader
        className="mx-auto max-w-2xl"
        title="Users"
        description="Who can sign in, and what they are allowed to do."
      />
      <PageBody className="mx-auto max-w-2xl">
        <Table>
          <THead>
            <TR>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((u) => {
              const locked = u.isSuperAdmin || u.id === currentUserId; // no actions on super-admin or self
              return (
                <TR key={u.id}>
                  <TD>
                    <span className="flex items-center gap-2">
                      {u.email}
                      {u.isSuperAdmin && <Badge>super-admin</Badge>}
                    </span>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                      {u.blockedAt && <Badge tone="danger">Blocked</Badge>}
                    </span>
                  </TD>
                  <TD className="text-right">
                    {!locked && (
                      <span className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`toggle role ${u.email}`}
                          onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                        >
                          {u.role === "admin" ? "Make user" : "Make admin"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`${u.blockedAt ? "unblock" : "block"} ${u.email}`}
                          onClick={() => patch(u.id, { blocked: !u.blockedAt })}
                        >
                          {u.blockedAt ? "Unblock" : "Block"}
                        </Button>
                      </span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </PageBody>
    </>
  );
}
