// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsForm } from "@/components/admin/settings-form";

const MASKED = {
  chatProvider: "openai", chatModel: "gpt-4o",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  keys: { google: { set: true, last4: "1234" }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => MASKED })) as any;
});

describe("SettingsForm", () => {
  it("shows a masked placeholder for a set key", async () => {
    render(<SettingsForm />);
    await waitFor(() => expect(screen.getByLabelText("Google API key")).toBeTruthy());
    expect((screen.getByLabelText("Google API key") as HTMLInputElement).placeholder).toContain("1234");
  });

  it("warns when the chat provider has no key", async () => {
    render(<SettingsForm />);
    // chatProvider is openai, whose key is not set -> a warning is shown.
    await waitFor(() => expect(screen.getByText(/No key set for openai/i)).toBeTruthy());
  });
});
