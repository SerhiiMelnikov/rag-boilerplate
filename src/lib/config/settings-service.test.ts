import { describe, it, expect, vi } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/config/crypto";
import { getRuntimeSettings, getAdminSettings, updateSettings, settingsPatchSchema, getRegistrationSettings } from "@/lib/config/settings-service";

// Real crypto module, but decryptSecret is wrapped in a spy (call-through to the
// actual implementation) so tests can observe whether it was invoked. This keeps
// every other test in this file working against the real encrypt/decrypt round
// trip.
vi.mock("@/lib/config/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/crypto")>();
  return { ...actual, decryptSecret: vi.fn(actual.decryptSecret) };
});

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
  registrationMode: "verified", allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  googleKey: null, openaiKey: null, anthropicKey: null, smtpPassword: null,
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

  it("getRegistrationSettings decrypts smtpPassword but never touches the provider keys", async () => {
    vi.mocked(decryptSecret).mockClear();
    const { db } = fakeDb({
      ...baseRow,
      registrationMode: "verified", allowedEmailDomains: "acme.com",
      smtpHost: "smtp.acme.com", smtpPort: 2525, smtpUser: "bot", smtpFrom: "bot@acme.com",
      smtpPassword: encryptSecret("s-pass-1234"),
      googleKey: encryptSecret("g-key-1234"),
    });
    const s = await getRegistrationSettings(db);
    expect(s.smtpPassword).toBe("s-pass-1234");
    expect(s.registrationMode).toBe("verified");
    expect(s.allowedEmailDomains).toBe("acme.com");
    expect(s.smtpHost).toBe("smtp.acme.com");
    expect(s.smtpPort).toBe(2525);
    expect(s.smtpUser).toBe("bot");
    expect(s.smtpFrom).toBe("bot@acme.com");
    // decryptSecret was called exactly once (for smtpPassword) — the provider keys
    // were never passed through it.
    expect(decryptSecret).toHaveBeenCalledTimes(1);
    expect(decryptSecret).toHaveBeenCalledWith(expect.stringMatching(/.+/));
    expect(JSON.stringify(s)).not.toContain("g-key-1234");
  });

  it("schema rejects an unknown provider and a sampling top_p", () => {
    expect(settingsPatchSchema.safeParse({ chatProvider: "mistral" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ topP: 0.9 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ embeddingProvider: "anthropic" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ chatProvider: "openai" }).success).toBe(true);
  });
});
