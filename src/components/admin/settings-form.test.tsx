// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettingsForm } from "@/components/admin/settings-form";

const MASKED = {
  chatProvider: "openai", chatModel: "gpt-4o",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  allowedEmailDomains: "",
  smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: { set: true, last4: "1234" }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
  smtpPassword: { set: false, last4: null },
};

const UNIFIED = { ...MASKED, unifiedMode: true };

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => MASKED })) as unknown as typeof fetch;
});

describe("SettingsForm", () => {
  it("warns when the chat provider has no key", async () => {
    render(<SettingsForm />);
    // chatProvider is openai, whose key is not set -> a warning is shown pointing
    // to the separate Provider keys page.
    await waitFor(() => expect(screen.getByText(/No key set for openai/i)).toBeTruthy());
  });

  it("does not render provider key inputs (they live on the Provider keys page)", async () => {
    render(<SettingsForm />);
    await waitFor(() => expect(screen.getByLabelText("Chat model")).toBeTruthy());
    expect(screen.queryByLabelText("Google API key")).toBeNull();
  });

  it("shows the Image analyzer row when unified mode is off", async () => {
    render(<SettingsForm />);
    expect(await screen.findByLabelText("Image analyzer provider")).toBeInTheDocument();
  });

  it("collapses to a single unified row when unified mode is on", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => UNIFIED })) as unknown as typeof fetch;
    render(<SettingsForm />);
    expect(await screen.findByLabelText("All tasks provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chat provider")).not.toBeInTheDocument();
  });

  it("shows the allowed-domains hint that empty means nobody can register", async () => {
    render(<SettingsForm />);
    expect(await screen.findByLabelText("Allowed email domains")).toBeInTheDocument();
    expect(screen.getByText(/Comma-separated\. Empty means nobody can register\./i)).toBeInTheDocument();
  });

  // registrationMode is a scaffold-time CLI choice the template pruning step removes
  // for; it must never come back as a runtime admin setting.
  it("never renders a registration-mode field", async () => {
    render(<SettingsForm />);
    await screen.findByLabelText("Allowed email domains");
    expect(screen.queryByLabelText(/registration.?mode/i)).toBeNull();
    expect(screen.queryByText(/registrationMode/i)).toBeNull();
  });

  it("renders the SMTP password masked, never binding the stored value into the input", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...MASKED, smtpPassword: { set: true, last4: "5678" } }),
    })) as unknown as typeof fetch;
    render(<SettingsForm />);
    const input = (await screen.findByLabelText("SMTP password")) as HTMLInputElement;
    // The masked {set, last4} object must never be bound as the input's value —
    // only shown as a placeholder. The input itself starts empty.
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("••••5678");
    expect(input.type).toBe("password");
  });

  it("does not send smtpPassword on save when the field is left untouched", async () => {
    render(<SettingsForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
      expect(put).toBeTruthy();
      const body = JSON.parse((put![1] as { body: string }).body);
      expect(body).not.toHaveProperty("smtpPassword");
    });
  });

  it("sends the typed SMTP password, trimmed, only when the admin types one", async () => {
    render(<SettingsForm />);
    const input = await screen.findByLabelText("SMTP password");
    fireEvent.change(input, { target: { value: "  new-secret-1234  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
      const body = JSON.parse((put![1] as { body: string }).body);
      expect(body.smtpPassword).toBe("new-secret-1234");
    });
  });
});
