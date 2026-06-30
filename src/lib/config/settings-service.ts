import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/config/crypto";

export type ProviderId = "google" | "openai" | "anthropic" | "ollama";
export type EmbeddingProviderId = "google" | "openai" | "ollama";
export type KeyStatus = { set: boolean; last4: string | null };

const CHAT_PROVIDERS = ["google", "openai", "anthropic", "ollama"] as const;
const EMBEDDING_PROVIDERS = ["google", "openai", "ollama"] as const;

interface BaseSettings {
  chatProvider: string;
  chatModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  parserProvider: string;
  parserModel: string;
  temperature: number;
  topK: number;
  minSimilarity: number;
  contextTokenBudget: number;
  systemPrompt: string;
  ollamaBaseUrl: string;
}

export interface RuntimeSettings extends BaseSettings {
  keys: { google: string | null; openai: string | null; anthropic: string | null };
}

export interface AdminSettings extends BaseSettings {
  keys: { google: KeyStatus; openai: KeyStatus; anthropic: KeyStatus };
}

// Non-key columns selected for both projections.
const BASE_COLUMNS = {
  chatProvider: settings.chatProvider,
  chatModel: settings.chatModel,
  embeddingProvider: settings.embeddingProvider,
  embeddingModel: settings.embeddingModel,
  parserProvider: settings.parserProvider,
  parserModel: settings.parserModel,
  temperature: settings.temperature,
  topK: settings.topK,
  minSimilarity: settings.minSimilarity,
  contextTokenBudget: settings.contextTokenBudget,
  systemPrompt: settings.systemPrompt,
  ollamaBaseUrl: settings.ollamaBaseUrl,
};
const ALL_COLUMNS = {
  ...BASE_COLUMNS,
  googleKey: settings.googleKey,
  openaiKey: settings.openaiKey,
  anthropicKey: settings.anthropicKey,
};

// strict() so unknown fields (e.g. a stray top_p) are rejected.
export const settingsPatchSchema = z
  .object({
    chatProvider: z.enum(CHAT_PROVIDERS),
    chatModel: z.string().min(1),
    embeddingProvider: z.enum(EMBEDDING_PROVIDERS),
    embeddingModel: z.string().min(1),
    parserProvider: z.enum(CHAT_PROVIDERS),
    parserModel: z.string().min(1),
    temperature: z.number().min(0).max(2),
    topK: z.number().int().min(1).max(50),
    minSimilarity: z.number().min(0).max(1),
    contextTokenBudget: z.number().int().min(100).max(100000),
    systemPrompt: z.string().min(1),
    ollamaBaseUrl: z.string().url(),
    // Keys: omit = leave, null = clear, string = set new plaintext.
    googleKey: z.string().min(1).nullable(),
    openaiKey: z.string().min(1).nullable(),
    anthropicKey: z.string().min(1).nullable(),
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

type Row = BaseSettings & { googleKey: string | null; openaiKey: string | null; anthropicKey: string | null };

async function readRow(database = defaultDb): Promise<Row> {
  const rows = await database.select(ALL_COLUMNS).from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows[0]) return rows[0] as Row;
  const [created] = await database.insert(settings).values({ id: 1 }).onConflictDoNothing().returning(ALL_COLUMNS);
  if (created) return created as Row;
  const after = await database.select(ALL_COLUMNS).from(settings).where(eq(settings.id, 1)).limit(1);
  return after[0] as Row;
}

function base(row: Row): BaseSettings {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { googleKey, openaiKey, anthropicKey, ...rest } = row;
  return rest;
}

function dec(blob: string | null): string | null {
  return blob ? decryptSecret(blob) : null;
}

export async function getRuntimeSettings(database = defaultDb): Promise<RuntimeSettings> {
  const row = await readRow(database);
  return {
    ...base(row),
    keys: { google: dec(row.googleKey), openai: dec(row.openaiKey), anthropic: dec(row.anthropicKey) },
  };
}

export async function getAdminSettings(database = defaultDb): Promise<AdminSettings> {
  const row = await readRow(database);
  return {
    ...base(row),
    keys: { google: maskSecret(row.googleKey), openai: maskSecret(row.openaiKey), anthropic: maskSecret(row.anthropicKey) },
  };
}

// Maps a key patch value: undefined -> skip, null -> clear, string -> encrypt.
function keyUpdate(set: Record<string, unknown>, column: "googleKey" | "openaiKey" | "anthropicKey", value: string | null | undefined) {
  if (value === undefined) return;
  set[column] = value === null ? null : encryptSecret(value);
}

export async function updateSettings(patch: SettingsPatch, database = defaultDb): Promise<AdminSettings> {
  const { googleKey, openaiKey, anthropicKey, ...rest } = patch;
  const set: Record<string, unknown> = { ...rest };
  keyUpdate(set, "googleKey", googleKey);
  keyUpdate(set, "openaiKey", openaiKey);
  keyUpdate(set, "anthropicKey", anthropicKey);
  await readRow(database); // ensure the singleton exists
  if (Object.keys(set).length > 0) {
    await database.update(settings).set(set).where(eq(settings.id, 1));
  }
  return getAdminSettings(database);
}
