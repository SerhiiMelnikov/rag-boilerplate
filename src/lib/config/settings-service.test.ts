import { describe, it, expect, vi } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/config/crypto";
import { getRuntimeSettings, getAdminSettings, updateSettings, settingsPatchSchema, getRateLimitSettings } from "@/lib/config/settings-service";

// Minimal fake Drizzle: a single settings row we can read/update. Returns
// { db, state } rather than stashing `state` on the db object itself, so
// callers get a properly typed handle instead of casting db back to read it.
function fakeDb(row: Record<string, unknown>) {
  const state = { ...row };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [state] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [state] }) }) }),
    update: () => ({ set: (patch: Record<string, unknown>) => { Object.assign(state, patch); return { where: () => ({ returning: async () => [state] }) }; } }),
  };
  // Deliberate: this fake only implements the Drizzle calls the settings
  // service actually makes, not the full `typeof defaultDb` surface — `never`
  // (not `any`) bridges it.
  return { db: db as never, state };
}

const baseRow = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  googleKey: null, openaiKey: null, anthropicKey: null,
};

describe("settings service", () => {
  it("getRuntimeSettings decrypts keys", async () => {
    const { db } = fakeDb({ ...baseRow, googleKey: encryptSecret("g-key-1234") });
    const s = await getRuntimeSettings(db);
    expect(s.keys.google).toBe("g-key-1234");
    expect(s.keys.openai).toBeNull();
    expect(s.chatModel).toBe("gemma-4-31b-it");
  });

  it("exposes imageProvider/imageModel with gemini defaults", async () => {
    const { db } = fakeDb(baseRow);
    const s = await getRuntimeSettings(db);
    expect(s.imageProvider).toBe("google");
    expect(s.imageModel).toBe("gemini-2.5-flash");
  });

  it("getAdminSettings masks keys (no plaintext)", async () => {
    const { db } = fakeDb({ ...baseRow, googleKey: encryptSecret("g-key-1234") });
    const s = await getAdminSettings(db);
    expect(s.keys.google).toEqual({ set: true, last4: "1234" });
    expect(s.keys.openai).toEqual({ set: false, last4: null });
    expect(JSON.stringify(s)).not.toContain("g-key-1234");
  });

  it("updateSettings encrypts a new key and leaves omitted keys untouched", async () => {
    const { db, state } = fakeDb({ ...baseRow, googleKey: encryptSecret("old-google") });
    await updateSettings({ openaiKey: "o-key-9999" }, db);
    expect(state.openaiKey).not.toBe("o-key-9999"); // stored encrypted
    expect(state.googleKey).not.toBeNull(); // untouched
    expect(decryptSecret(state.googleKey as string)).toBe("old-google");
  });

  it("updateSettings clears a key on explicit null", async () => {
    const { db, state } = fakeDb({ ...baseRow, googleKey: encryptSecret("old-google") });
    await updateSettings({ googleKey: null }, db);
    expect(state.googleKey).toBeNull();
  });

  it("getRuntimeSettings applies unifiedMode to chat/parser/image but not embedding", async () => {
    const { db } = fakeDb({ ...baseRow, unifiedMode: true, unifiedProvider: "openai", unifiedModel: "gpt-4o" });
    const s = await getRuntimeSettings(db);
    expect(s.chatProvider).toBe("openai");
    expect(s.chatModel).toBe("gpt-4o");
    expect(s.parserProvider).toBe("openai");
    expect(s.imageProvider).toBe("openai");
    expect(s.embeddingProvider).toBe("google"); // never overridden
  });

  it("getAdminSettings returns the raw per-task values + unifiedMode", async () => {
    const { db } = fakeDb({ ...baseRow, unifiedMode: true, unifiedProvider: "openai", unifiedModel: "gpt-4o" });
    const s = await getAdminSettings(db);
    expect(s.unifiedMode).toBe(true);
    expect(s.chatProvider).toBe("google"); // raw, NOT resolved
  });

  it("schema rejects an unknown provider and a sampling top_p", () => {
    expect(settingsPatchSchema.safeParse({ chatProvider: "mistral" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ topP: 0.9 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ embeddingProvider: "anthropic" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ chatProvider: "openai" }).success).toBe(true);
  });
});

describe("getRateLimitSettings", () => {
  it("returns the three limits without decrypting any provider key", async () => {
    const decrypt = vi.fn();
    const row = {
      chatRateLimitPerMinute: 7,
      chatRateLimitPerDay: 70,
      registerRateLimitPerHour: 3,
      googleKey: "encrypted-blob",
      openaiKey: null,
      anthropicKey: null,
    };
    const database = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
    } as never;

    const out = await getRateLimitSettings(database);

    expect(out).toEqual({ chatRateLimitPerMinute: 7, chatRateLimitPerDay: 70, registerRateLimitPerHour: 3 });
    // The point of the narrow projection: an unauthenticated endpoint must not
    // pull secrets through the decryptor.
    expect(decrypt).not.toHaveBeenCalled();
  });
});
