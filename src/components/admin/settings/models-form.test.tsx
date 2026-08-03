// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ModelsForm } from "./models-form";
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

describe("ModelsForm", () => {
  // The keys live on this page now, so the warning points down the page rather
  // than away from it — there is no other route left to send anyone to.
  it("warns when a task's provider has no key, without linking elsewhere", async () => {
    render(<ModelsForm />);
    expect(await screen.findByText(/No key set for openai/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /key/i })).toBeNull();
  });

  it("shows the Image analyzer row when unified mode is off", async () => {
    render(<ModelsForm />);
    expect(await screen.findByLabelText("Image analyzer provider")).toBeInTheDocument();
  });

  it("collapses to a single unified row when unified mode is on", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ...MASKED, unifiedMode: true }) })) as unknown as typeof fetch;
    render(<ModelsForm />);
    expect(await screen.findByLabelText("All tasks provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chat provider")).not.toBeInTheDocument();
  });

  // Embedding is excluded from unified mode: anthropic cannot embed, so one
  // provider for "all tasks" would break retrieval on an anthropic-led setup.
  it("keeps the embedding row visible in unified mode", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ...MASKED, unifiedMode: true }) })) as unknown as typeof fetch;
    render(<ModelsForm />);
    expect(await screen.findByLabelText("Embedding provider")).toBeInTheDocument();
  });

  // Anthropic cannot embed. Without this, swapping EMBEDDING_PROVIDER_IDS for
  // CHAT_PROVIDER_IDS (re-admitting anthropic) passes every other test.
  it("offers only embedding-capable providers in the Embedding row", async () => {
    render(<ModelsForm />);
    fireEvent.click(await screen.findByLabelText("Embedding provider"));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(EMBEDDING_PROVIDER_IDS);
  });

  it("shows a set key's last four digits, and an unset one as not set", async () => {
    render(<ModelsForm />);
    expect(await screen.findByText(/1234/)).toBeInTheDocument();
    expect(screen.getAllByText("not set").length).toBeGreaterThan(0);
  });

  it("never binds a stored key into an input", async () => {
    render(<ModelsForm />);
    const input = (await screen.findByLabelText("Google API key")) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
  });

  it("sends only the keys the admin typed, trimmed", async () => {
    render(<ModelsForm />);
    fireEvent.change(await screen.findByLabelText("OpenAI API key"), { target: { value: "  sk-new-key  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("openaiKey"));
    const body = putBody();
    expect(body.openaiKey).toBe("sk-new-key");
    expect(body).not.toHaveProperty("googleKey");
    expect(body).not.toHaveProperty("anthropicKey");
  });

  // This page owns the models, their keys and the Ollama address. Sending a field
  // another Settings route owns would clobber whatever was just changed there.
  it("saves only the fields this page owns", async () => {
    render(<ModelsForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("chatProvider"));
    const body = putBody();
    for (const owned of ["chatProvider", "chatModel", "embeddingProvider", "unifiedMode", "ollamaBaseUrl"]) {
      expect(body, `${owned} belongs to this page`).toHaveProperty(owned);
    }
    for (const foreign of ["temperature", "topK", "systemPrompt", "chatRateLimitPerMinute", "allowedEmailDomains", "smtpHost", "smtpPassword"]) {
      expect(body, `${foreign} belongs to another page`).not.toHaveProperty(foreign);
    }
  });

  it("keeps the typed keys when the save is rejected", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => MASKED })) as unknown as typeof fetch;
    render(<ModelsForm />);
    const input = (await screen.findByLabelText("OpenAI API key")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    expect(input.value).toBe("sk-new-key");
  });

  // The gap this page closes: the schema has always accepted null to clear a key,
  // and until Settings was rebuilt no interface could send it.
  it("asks before clearing a key, and does nothing if the admin cancels", async () => {
    render(<ModelsForm />);
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    expect(await screen.findByText(/Clear the Google API key\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Clear the Google API key\?/i)).toBeNull());
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => (c[1] as { method?: string } | undefined)?.method === "PUT")).toBe(false);
  });

  // Pinned as an exact key set, not a handful of spot checks. confirmClear once
  // sent `{ [keyName]: null }` alone, and the hook adopts the PUT response
  // wholesale — so clearing one key silently reverted every unsaved edit on the
  // page. That regression is invisible to `not.toHaveProperty` checks, which pass
  // just as happily when the body is too SMALL.
  it("sends null for the cleared key, alongside exactly this page's own fields", async () => {
    render(<ModelsForm />);
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    fireEvent.click(await screen.findByRole("button", { name: "Clear key" }));
    await waitFor(() => expect(putBody()).toHaveProperty("googleKey"));
    const body = putBody();
    expect(body.googleKey).toBeNull();
    expect(Object.keys(body).sort()).toEqual([
      "chatModel", "chatProvider", "embeddingModel", "embeddingProvider", "googleKey",
      "imageModel", "imageProvider", "ollamaBaseUrl", "parserModel", "parserProvider",
      "unifiedMode", "unifiedModel", "unifiedProvider",
    ]);
  });

  it("keeps an unsaved Ollama base URL edit through a key clear", async () => {
    render(<ModelsForm />);
    fireEvent.change(await screen.findByLabelText("Ollama base URL"), { target: { value: "http://gpu-box:11434" } });
    fireEvent.click(screen.getByLabelText("Clear Google API key"));
    fireEvent.click(await screen.findByRole("button", { name: "Clear key" }));
    await waitFor(() => expect(putBody()).toHaveProperty("googleKey"));
    expect(putBody().ollamaBaseUrl).toBe("http://gpu-box:11434");
  });

  it("clears the typed inputs after a successful save", async () => {
    render(<ModelsForm />);
    const input = (await screen.findByLabelText("OpenAI API key")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(input.value).toBe(""));
  });

  // `saved` comes from the hook, which never sees a typed key — it is local state.
  // Without the gate, "Saved" sits over a secret that cannot be read back anywhere.
  it("hides Saved once the admin types a key", async () => {
    render(<ModelsForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: "sk-typed" } });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  // I3: the only test anywhere of a form rendered against a pruned catalog. An
  // ollama-only generated project has no keyed providers at all, and an empty
  // bordered "API keys" card shipped past tsc, lint and the whole scaffold matrix
  // precisely because nothing rendered this case.
  it("renders no API keys card when the catalog has no keyed providers", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers/catalog", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/providers/catalog")>()),
      KEYED_PROVIDERS: [],
    }));
    const { ModelsForm: Pruned } = await import("./models-form");
    render(<Pruned />);
    await screen.findByLabelText("Ollama base URL");
    expect(screen.queryByText("API keys")).toBeNull();
    vi.doUnmock("@/lib/providers/catalog");
  });

  it("shows the Ollama base URL because ollama is in the catalog", async () => {
    render(<ModelsForm />);
    expect(await screen.findByLabelText("Ollama base URL")).toBeInTheDocument();
  });
});
