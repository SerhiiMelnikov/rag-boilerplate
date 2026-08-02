// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AnsweringForm } from "./answering-form";
import { EMBEDDING_PROVIDER_IDS } from "@/lib/providers/catalog";

const MASKED = {
  chatProvider: "openai", chatModel: "gpt-4o",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  allowedEmailDomains: "", smtpHost: "", smtpPort: 587, smtpUser: "", smtpFrom: "",
  keys: { google: { set: true, last4: "1234" }, openai: { set: false, last4: null }, anthropic: { set: false, last4: null } },
  smtpPassword: { set: false, last4: null },
};

const putBody = () => {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
  return JSON.parse((put![1] as { body: string }).body) as Record<string, unknown>;
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => MASKED })) as unknown as typeof fetch;
});

describe("AnsweringForm", () => {
  it("warns when the chat provider has no key, and links to the keys page", async () => {
    render(<AnsweringForm />);
    await waitFor(() => expect(screen.getByText(/No key set for openai/i)).toBeTruthy());
    expect(screen.getByRole("link", { name: /provider keys/i })).toHaveAttribute("href", "/admin/settings/keys");
  });

  it("does not render provider key inputs — they live on the keys page", async () => {
    render(<AnsweringForm />);
    await waitFor(() => expect(screen.getByLabelText("Chat model")).toBeTruthy());
    expect(screen.queryByLabelText("Google API key")).toBeNull();
  });

  it("shows the Image analyzer row when unified mode is off", async () => {
    render(<AnsweringForm />);
    expect(await screen.findByLabelText("Image analyzer provider")).toBeInTheDocument();
  });

  it("collapses to a single unified row when unified mode is on", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ...MASKED, unifiedMode: true }) })) as unknown as typeof fetch;
    render(<AnsweringForm />);
    expect(await screen.findByLabelText("All tasks provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chat provider")).not.toBeInTheDocument();
  });

  // Embedding is excluded from unified mode: anthropic cannot embed, so one
  // provider for "all tasks" would break retrieval on an anthropic-led setup.
  it("keeps the embedding row visible in unified mode", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ...MASKED, unifiedMode: true }) })) as unknown as typeof fetch;
    render(<AnsweringForm />);
    expect(await screen.findByLabelText("Embedding provider")).toBeInTheDocument();
  });

  // Anthropic cannot embed. Nothing before this asserted the Embedding row's
  // actual option list, so swapping EMBEDDING_PROVIDER_IDS for CHAT_PROVIDER_IDS
  // (re-admitting anthropic) passed every existing test.
  it("offers only embedding-capable providers in the Embedding row", async () => {
    render(<AnsweringForm />);
    fireEvent.click(await screen.findByLabelText("Embedding provider"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(EMBEDDING_PROVIDER_IDS);
  });

  // The whole point of three routes: this page's Save must not overwrite fields
  // that belong to another page. A body carrying them would clobber whatever
  // another admin had just changed there.
  it("saves only the fields this page owns", async () => {
    render(<AnsweringForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("chatProvider"));
    const body = putBody();
    for (const owned of ["chatProvider", "chatModel", "embeddingProvider", "temperature", "topK", "systemPrompt", "chatRateLimitPerMinute"]) {
      expect(body, `${owned} belongs to this page`).toHaveProperty(owned);
    }
    for (const foreign of ["allowedEmailDomains", "smtpHost", "smtpPort", "smtpUser", "smtpFrom", "smtpPassword", "googleKey", "ollamaBaseUrl"]) {
      expect(body, `${foreign} belongs to another page`).not.toHaveProperty(foreign);
    }
  });

  it("surfaces a rejected save instead of looking like nothing happened", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => MASKED })) as unknown as typeof fetch;
    render(<AnsweringForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
  });
});
