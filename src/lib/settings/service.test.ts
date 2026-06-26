import { describe, it, expect, vi } from "vitest";
import { getSettings, updateSettings } from "@/lib/settings/service";

const ROW = { topK: 5, model: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };

function fakeDb(opts: { existing?: any[]; afterWrite?: any[] } = {}) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => opts.existing ?? [] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => opts.afterWrite ?? [ROW] }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => opts.afterWrite ?? [ROW] }) }) }),
  } as any;
}

describe("getSettings", () => {
  it("returns the existing singleton", async () => {
    expect(await getSettings(fakeDb({ existing: [ROW] }))).toEqual(ROW);
  });
  it("creates and returns defaults when missing", async () => {
    expect(await getSettings(fakeDb({ existing: [], afterWrite: [ROW] }))).toEqual(ROW);
  });
});

describe("updateSettings", () => {
  it("applies a patch and returns the new values", async () => {
    const next = { ...ROW, topK: 8 };
    expect(await updateSettings({ topK: 8 }, fakeDb({ afterWrite: [next] }))).toEqual(next);
  });
});
