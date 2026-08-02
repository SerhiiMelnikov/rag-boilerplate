// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { KeysForm } from "./keys-form";

const MASKED = {
  ollamaBaseUrl: "http://localhost:11434",
  keys: {
    google: { set: true, last4: "1234" },
    openai: { set: false, last4: null },
    anthropic: { set: false, last4: null },
  },
};

const putBody = () => {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const put = calls.find((c) => (c[1] as { method?: string } | undefined)?.method === "PUT");
  return JSON.parse((put![1] as { body: string }).body) as Record<string, unknown>;
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => MASKED })) as unknown as typeof fetch;
});

describe("KeysForm", () => {
  it("shows a set key's last four digits as its status", async () => {
    render(<KeysForm />);
    // Matched on the digits alone, not on the masking dots: pinning "····1234"
    // would make the test fail if someone swapped the character for a bullet or
    // an asterisk, which is a styling choice, not the behaviour under test.
    expect(await screen.findByText(/1234/)).toBeInTheDocument();
  });

  it("shows an unset key as not set, with no Clear action", async () => {
    render(<KeysForm />);
    await screen.findByLabelText("OpenAI API key");
    expect(screen.getAllByText("not set").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Clear OpenAI API key")).toBeNull();
  });

  it("never binds a stored key into an input", async () => {
    render(<KeysForm />);
    const input = (await screen.findByLabelText("Google API key")) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.type).toBe("password");
  });

  it("sends only the keys the admin typed, trimmed", async () => {
    render(<KeysForm />);
    fireEvent.change(await screen.findByLabelText("OpenAI API key"), { target: { value: "  sk-new-key  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("openaiKey"));
    const body = putBody();
    expect(body.openaiKey).toBe("sk-new-key");
    expect(body).not.toHaveProperty("googleKey");
    expect(body).not.toHaveProperty("anthropicKey");
  });

  it("sends the Ollama base URL, which is this page's only non-key field", async () => {
    render(<KeysForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("ollamaBaseUrl"));
    const body = putBody();
    expect(body.ollamaBaseUrl).toBe("http://localhost:11434");
    for (const foreign of ["chatProvider", "temperature", "smtpHost", "allowedEmailDomains"]) {
      expect(body, `${foreign} belongs to another page`).not.toHaveProperty(foreign);
    }
  });

  it("clears the typed inputs after a successful save", async () => {
    render(<KeysForm />);
    const input = (await screen.findByLabelText("OpenAI API key")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps the typed inputs when the save is rejected", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => MASKED })) as unknown as typeof fetch;
    render(<KeysForm />);
    const input = (await screen.findByLabelText("OpenAI API key")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    expect(input.value).toBe("sk-new-key");
  });

  // The gap this page closes: the schema has always accepted null to clear a key,
  // and no interface could send it.
  it("asks before clearing a key, and does nothing if the admin cancels", async () => {
    render(<KeysForm />);
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    expect(await screen.findByText(/Clear the Google API key\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(/Clear the Google API key\?/i)).toBeNull());
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => (c[1] as { method?: string } | undefined)?.method === "PUT")).toBe(false);
  });

  // confirmClear sends this page's own fields: the cleared key AND ollamaBaseUrl,
  // which this page owns too. It must never send another provider's key or a
  // field that belongs to another Settings page.
  it("sends null for the cleared key plus this page's own ollamaBaseUrl, and nothing else", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        // Echo the cleared key back as unset, the way the real API would, so
        // the badge assertion below observes a real state transition rather
        // than a mock that never changes.
        return {
          ok: true,
          json: async () => ({ ...MASKED, keys: { ...MASKED.keys, google: { set: false, last4: null } } }),
        };
      }
      return { ok: true, json: async () => MASKED };
    }) as unknown as typeof fetch;
    render(<KeysForm />);
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    fireEvent.click(await screen.findByRole("button", { name: "Clear key" }));
    await waitFor(() => expect(putBody()).toHaveProperty("googleKey"));
    const body = putBody();
    expect(body.googleKey).toBeNull();
    expect(body.ollamaBaseUrl).toBe(MASKED.ollamaBaseUrl);
    expect(Object.keys(body).sort()).toEqual(["googleKey", "ollamaBaseUrl"]);
    // The row actually returns to "not set" once the PUT response comes back —
    // previously nothing asserted this and a mock that never updated `keys`
    // would have hidden a badge that never flips.
    expect(screen.queryByLabelText("Clear Google API key")).toBeNull();
    expect(await screen.findAllByText("not set")).toHaveLength(3);
  });

  // The bug this guards: confirmClear used to send only `{ [keyName]: null }`.
  // The hook adopts the full PUT response into `settings`, so an unsaved edit
  // to a field this page also owns (the Ollama base URL) would be silently
  // reverted to its last-saved value the moment any key was cleared.
  it("keeps an unsaved Ollama base URL edit through a key clear", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const sent = JSON.parse((init.body as string)) as Record<string, unknown>;
        return { ok: true, json: async () => ({ ...MASKED, ...sent, keys: MASKED.keys }) };
      }
      return { ok: true, json: async () => MASKED };
    }) as unknown as typeof fetch;
    render(<KeysForm />);
    const urlInput = (await screen.findByLabelText("Ollama base URL")) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: "http://gpu-box:11434" } });
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    fireEvent.click(await screen.findByRole("button", { name: "Clear key" }));
    await waitFor(() => expect(putBody()).toHaveProperty("googleKey"));
    expect(putBody().ollamaBaseUrl).toBe("http://gpu-box:11434");
    await waitFor(() => expect(urlInput.value).toBe("http://gpu-box:11434"));
  });

  // The bug this guards: `saved` comes from the hook, which never sees a typed
  // key — that is local component state. Without gating on that local
  // dirtiness, "Saved" from an earlier successful save would keep showing
  // while an unconfirmed OpenAI key sits in the input, over a secret that
  // cannot be read back from anywhere.
  it("hides Saved once the admin types a key, even though the hook still thinks it saved", async () => {
    render(<KeysForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("OpenAI API key"), { target: { value: "sk-typed" } });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows the Ollama base URL because ollama is in the catalog", async () => {
    render(<KeysForm />);
    expect(await screen.findByLabelText("Ollama base URL")).toBeInTheDocument();
  });

  // A generated project that kept only ollama has no keyed providers at all. Nothing
  // else on the branch renders a form against a pruned catalog — that gap is exactly
  // how an empty bordered card shipped past tsc, lint, and the scaffold matrix.
  it("renders no API keys card when the catalog has no keyed providers", async () => {
    vi.resetModules();
    vi.doMock("@/lib/providers/catalog", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/providers/catalog")>()),
      KEYED_PROVIDERS: [],
    }));
    const { KeysForm: Pruned } = await import("./keys-form");
    render(<Pruned />);
    await screen.findByLabelText("Ollama base URL");
    expect(screen.queryByText("API keys")).toBeNull();
    vi.doUnmock("@/lib/providers/catalog");
  });
});
