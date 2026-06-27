// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm } from "@/components/admin/settings-form";

const SETTINGS = { topK: 5, model: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) return { ok: true, json: async () => SETTINGS };
    return { ok: true, json: async () => ({ ...SETTINGS, topK: 9 }) };
  }));
});

describe("SettingsForm", () => {
  it("loads settings and saves an update", async () => {
    render(<SettingsForm />);
    const topK = await screen.findByLabelText(/top.?k/i);
    expect((topK as HTMLInputElement).value).toBe("5");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(fetch).toHaveBeenCalledWith("/api/admin/settings", expect.objectContaining({ method: "PUT" }));
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });
});
