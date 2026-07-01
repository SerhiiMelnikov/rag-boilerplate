// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProviderKeysForm } from "@/components/admin/provider-keys-form";

const MASKED = {
  ollamaBaseUrl: "http://localhost:11434",
  keys: { google: { set: true, last4: "1234" }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => MASKED })) as any;
});

describe("ProviderKeysForm", () => {
  it("shows a masked placeholder for a set key", async () => {
    render(<ProviderKeysForm />);
    await waitFor(() => expect(screen.getByLabelText("Google API key")).toBeTruthy());
    expect((screen.getByLabelText("Google API key") as HTMLInputElement).placeholder).toContain("1234");
  });

  it("shows 'not set' for an unset key", async () => {
    render(<ProviderKeysForm />);
    await waitFor(() => expect(screen.getByLabelText("OpenAI API key")).toBeTruthy());
    expect((screen.getByLabelText("OpenAI API key") as HTMLInputElement).placeholder).toBe("not set");
  });
});
