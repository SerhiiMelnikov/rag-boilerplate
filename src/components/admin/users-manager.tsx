"use client";
import { useEffect, useState, useCallback } from "react";
import { Shield, ShieldOff, Lock, LockOpen, Users, SearchX } from "lucide-react";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

type Row = { id: string; email: string; role: "admin" | "user"; isSuperAdmin: boolean; blockedAt: string | null };

// Same threshold as the conversation list: a box that appears on a short list is
// clutter, and one that never appears on a long list is a missing feature.
const SEARCH_THRESHOLD = 8;

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pendingBlock, setPendingBlock] = useState<Row | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setRows((await res.json()).users);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    // Reloading only on success and saying nothing otherwise is how a failed
    // change looks exactly like one that has not finished yet.
    if (!res.ok) { setError("Could not apply that change. Try again."); return; }
    await load();
  }

  const searchable = (rows?.length ?? 0) >= SEARCH_THRESHOLD;
  // `visible` below already gates filtering behind `searchable &&`, so a box that
  // has disappeared can never leave the list invisibly filtered. What this guards
  // against is narrower: if the row count climbs back over the threshold later in
  // the same mounted session, the box would otherwise reappear pre-filled with a
  // query the admin typed and forgot, instantly re-filtering a list they can now
  // see again.
  useEffect(() => {
    if (!searchable && query !== "") setQuery("");
  }, [searchable, query]);

  if (!rows) return <div className="p-6 text-ink-muted">Loading...</div>;

  const visible = searchable && query.trim() !== ""
    ? rows.filter((u) => u.email.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  return (
    <>
      <PageHeader
        className="mx-auto max-w-2xl"
        title="Users"
        description="Who can sign in, and what they are allowed to do."
      />
      <PageBody className="mx-auto max-w-2xl">
        {error && <Alert tone="danger">{error}</Alert>}
        {searchable && (
          <Input
            aria-label="Search accounts"
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-3 max-w-xs"
          />
        )}
        {visible.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No accounts yet"
              description="People appear here once they register at an allowed domain and confirm their email."
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
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {visible.map((u) => {
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
                      {locked ? (
                        // The row was already action-less; saying which kind of locked
                        // it is turns an apparent bug into a deliberate rule.
                        <Badge dashed>{u.id === currentUserId ? "you" : "protected"}</Badge>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            aria-label={u.role === "admin" ? `Make ${u.email} a user` : `Make ${u.email} an admin`}
                            onClick={() => void patch(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                            className={cn("text-ink-subtle transition-colors hover:text-ink", FOCUS_RING)}
                          >
                            {u.role === "admin" ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            aria-label={u.blockedAt ? `Unblock ${u.email}` : `Block ${u.email}`}
                            onClick={() => (u.blockedAt ? void patch(u.id, { blocked: false }) : setPendingBlock(u))}
                            className={cn("text-ink-subtle transition-colors hover:text-danger", FOCUS_RING)}
                          >
                            {u.blockedAt ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </button>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </PageBody>
      <ConfirmDialog
        open={pendingBlock !== null}
        title={pendingBlock ? `Block ${pendingBlock.email}?` : ""}
        description="They stay in the list and keep their history, but cannot sign in until you unblock them."
        confirmLabel="Block"
        pending={blocking}
        onConfirm={async () => {
          if (!pendingBlock) return;
          setBlocking(true);
          await patch(pendingBlock.id, { blocked: true });
          setBlocking(false);
          setPendingBlock(null);
        }}
        onCancel={() => setPendingBlock(null)}
      />
    </>
  );
}
