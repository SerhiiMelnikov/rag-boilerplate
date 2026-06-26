import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

export interface AppSettings {
  topK: number;
  model: string;
  temperature: number;
  systemPrompt: string;
  minSimilarity: number;
  contextTokenBudget: number;
}

const COLUMNS = {
  topK: settings.topK,
  model: settings.model,
  temperature: settings.temperature,
  systemPrompt: settings.systemPrompt,
  minSimilarity: settings.minSimilarity,
  contextTokenBudget: settings.contextTokenBudget,
};

// Validates a partial settings update from an admin.
export const settingsPatchSchema = z
  .object({
    topK: z.number().int().min(1).max(50),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    systemPrompt: z.string().min(1),
    minSimilarity: z.number().min(0).max(1),
    contextTokenBudget: z.number().int().min(100).max(100000),
  })
  .partial();

// Return the singleton settings row (id=1), creating it from defaults if absent.
export async function getSettings(database = defaultDb): Promise<AppSettings> {
  const rows = await database.select(COLUMNS).from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await database
    .insert(settings)
    .values({ id: 1 })
    .onConflictDoNothing()
    .returning(COLUMNS);
  if (created) return created;
  // Lost a creation race: read again.
  const after = await database.select(COLUMNS).from(settings).where(eq(settings.id, 1)).limit(1);
  return after[0];
}

// Apply a partial update to the singleton and return the new values.
export async function updateSettings(patch: Partial<AppSettings>, database = defaultDb): Promise<AppSettings> {
  if (Object.keys(patch).length === 0) return getSettings(database);
  const [row] = await database.update(settings).set(patch).where(eq(settings.id, 1)).returning(COLUMNS);
  return row;
}
