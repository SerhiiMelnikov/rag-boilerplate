import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/config/crypto";
import { getRuntimeSettings, getAdminSettings, updateSettings, settingsPatchSchema } from "@/lib/config/settings-service";

// Minimal fake Drizzle: a single settings row we can read/update.
function fakeDb(row: Record<string, unknown>) {
  const state = { ...row };
  return {
    state,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [state] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [state] }) }) }),
    update: () => ({ set: (patch: Record<string, unknown>) => { Object.assign(state, patch); return { where: () => ({ returning: async () => [state] }) }; } }),
  } as any;
}

const baseRow = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  googleKey: null, openaiKey: null, anthropicKey: null,
};

describe("settings service", () => {
  it("getRuntimeSettings decrypts keys", async () => {
    const db = fakeDb({ ...baseRow, googleKey: encryptSecret("g-key-1234") });
    const s = await getRuntimeSettings(db);
    expect(s.keys.google).toBe("g-key-1234");
    expect(s.keys.openai).toBeNull();
    expect(s.chatModel).toBe("gemma-4-31b-it");
  });

  it("getAdminSettings masks keys (no plaintext)", async () => {
    const db = fakeDb({ ...baseRow, googleKey: encryptSecret("g-key-1234") });
    const s = await getAdminSettings(db);
    expect(s.keys.google).toEqual({ set: true, last4: "1234" });
    expect(s.keys.openai).toEqual({ set: false, last4: null });
    expect(JSON.stringify(s)).not.toContain("g-key-1234");
  });

  it("updateSettings encrypts a new key and leaves omitted keys untouched", async () => {
    const db = fakeDb({ ...baseRow, googleKey: encryptSecret("old-google") });
    await updateSettings({ openaiKey: "o-key-9999" }, db);
    expect(db.state.openaiKey).not.toBe("o-key-9999"); // stored encrypted
    expect(db.state.googleKey).not.toBeNull(); // untouched
    expect(decryptSecret(db.state.googleKey as string)).toBe("old-google");
  });

  it("updateSettings clears a key on explicit null", async () => {
    const db = fakeDb({ ...baseRow, googleKey: encryptSecret("old-google") });
    await updateSettings({ googleKey: null }, db);
    expect(db.state.googleKey).toBeNull();
  });

  it("schema rejects an unknown provider and a sampling top_p", () => {
    expect(settingsPatchSchema.safeParse({ chatProvider: "mistral" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ topP: 0.9 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ embeddingProvider: "anthropic" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ chatProvider: "openai" }).success).toBe(true);
  });
});
