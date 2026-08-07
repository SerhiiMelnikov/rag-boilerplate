// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AnsweringForm } from "./answering-form";

const MASKED = {
  chatProvider: "openai", chatModel: "gpt-4o",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  imageProvider: "google", imageModel: "gemini-2.5-flash",
  speechProvider: "google", speechModel: "gemini-2.5-flash",
  unifiedMode: false, unifiedProvider: "google", unifiedModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  chatRateLimitPerMinute: 20, chatRateLimitPerDay: 200,
  transcribeRateLimitPerMinute: 10, transcribeRateLimitPerDay: 100,
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
  it("renders the retrieval knobs, the limits and the prompt", async () => {
    render(<AnsweringForm />);
    expect(await screen.findByLabelText("Top-K")).toBeInTheDocument();
    expect(screen.getByLabelText("Min similarity")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat requests / minute")).toBeInTheDocument();
    expect(screen.getByLabelText("System prompt")).toBeInTheDocument();
  });

  // Which model runs each task moved to its own page. A control left behind here
  // would save into a body this page no longer sends, and change nothing.
  it("does not render model or key controls — they live on the Models page", async () => {
    render(<AnsweringForm />);
    await screen.findByLabelText("Top-K");
    expect(screen.queryByLabelText("Chat provider")).toBeNull();
    expect(screen.queryByLabelText("Embedding provider")).toBeNull();
    expect(screen.queryByLabelText("Google API key")).toBeNull();
    expect(screen.queryByLabelText("Ollama base URL")).toBeNull();
  });

  // The whole point of splitting Settings: this page's Save must not overwrite
  // fields another page owns, or it clobbers whatever was just changed there.
  it("saves only the fields this page owns", async () => {
    render(<AnsweringForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("topK"));
    const body = putBody();
    for (const owned of ["temperature", "topK", "minSimilarity", "contextTokenBudget", "systemPrompt", "chatRateLimitPerMinute", "chatRateLimitPerDay", "transcribeRateLimitPerMinute", "transcribeRateLimitPerDay"]) {
      expect(body, `${owned} belongs to this page`).toHaveProperty(owned);
    }
    for (const foreign of ["chatProvider", "chatModel", "embeddingProvider", "unifiedMode", "ollamaBaseUrl", "googleKey", "allowedEmailDomains", "smtpHost"]) {
      expect(body, `${foreign} belongs to another page`).not.toHaveProperty(foreign);
    }
  });

  // A scaffold with no speech-capable provider ships no microphone and no
  // transcribe endpoint, so a limit on transcriptions is a control over nothing
  // — and a field the admin cannot see is a field they cannot have edited.
  // Same guard, same reasoning, as the speech row on the Models page.
  it("renders and sends no transcription limits when the catalog has no speech provider", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers/catalog", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/providers/catalog")>()),
      SPEECH_PROVIDER_IDS: [],
    }));
    const { AnsweringForm: Pruned } = await import("./answering-form");
    render(<Pruned />);

    await screen.findByLabelText("Chat requests / minute");
    expect(screen.queryByLabelText("Voice transcriptions / minute")).toBeNull();
    expect(screen.queryByLabelText("Voice transcriptions / day")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("topK"));
    const body = putBody();
    expect(body).not.toHaveProperty("transcribeRateLimitPerMinute");
    expect(body).not.toHaveProperty("transcribeRateLimitPerDay");
    vi.doUnmock("@/lib/providers/catalog");
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
