import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";

// Create the default (General) workspace if it does not exist yet, and return its id.
//
// Every workspace lookup resolves through the default one, so a project whose
// `workspaces` table is empty cannot serve a single chat, upload or admin page. The
// pgvector migrations seed it in SQL, but a project scaffolded onto any other vector
// store generates its schema with `db:generate`, which emits DDL only — no seed row.
// So the seed script (which every install runs) ensures it here, for every store.
//
// Idempotent: safe to run on every seed, and the unique name makes a concurrent second
// insert a no-op rather than a duplicate.
export async function ensureDefaultWorkspace(database = defaultDb): Promise<string> {
  const [existing] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.isDefault, true))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await database
    .insert(workspaces)
    .values({ name: "General", isDefault: true })
    .onConflictDoNothing({ target: workspaces.name })
    .returning({ id: workspaces.id });
  if (created) return created.id;

  // Lost a race with a concurrent seed: the row exists now, so read it back.
  const [row] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.isDefault, true))
    .limit(1);
  if (!row) throw new Error("could not create the default (General) workspace");
  return row.id;
}
