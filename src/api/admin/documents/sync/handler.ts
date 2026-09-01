import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { planSync, applySync } from "@/lib/documents/sync";

export interface SyncPreviewDeps { getAdmin?: typeof requireAdmin; plan?: typeof planSync }
export interface SyncApplyDeps { getAdmin?: typeof requireAdmin; apply?: typeof applySync; schedule?: (fn: () => Promise<unknown>) => void }

export async function syncPreviewResponse(request: Request, deps: SyncPreviewDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const plan = deps.plan ?? planSync;
  try { await getAdmin(request); } catch (err) { const r = errorToResponse(err); if (r) return r; throw err; }
  try {
    return Response.json(await plan());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Sync preview failed" }, { status: 409 });
  }
}

function isStringArray(v: unknown): v is string[] { return Array.isArray(v) && v.every((s) => typeof s === "string"); }

export async function syncApplyResponse(request: Request, deps: SyncApplyDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const apply = deps.apply ?? applySync;
  try { await getAdmin(request); } catch (err) { const r = errorToResponse(err); if (r) return r; throw err; }
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid body" }, { status: 400 }); }
  const b = body as Record<string, unknown> | null;
  if (!b || !isStringArray(b.add) || !isStringArray(b.update) || !isStringArray(b.delete)) {
    return Response.json({ error: "add, update and delete must be arrays of strings" }, { status: 400 });
  }
  const result = await apply({ add: b.add, update: b.update, delete: b.delete }, deps.schedule ? { schedule: deps.schedule } : {});
  return Response.json(result);
}
