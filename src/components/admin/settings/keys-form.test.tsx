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

  it("sends null for the cleared key only, on confirm", async () => {
    render(<KeysForm />);
    fireEvent.click(await screen.findByLabelText("Clear Google API key"));
    fireEvent.click(await screen.findByRole("button", { name: "Clear key" }));
    await waitFor(() => expect(putBody()).toHaveProperty("googleKey"));
    const body = putBody();
    expect(body.googleKey).toBeNull();
    expect(Object.keys(body)).toEqual(["googleKey"]);
  });

  it("shows the Ollama base URL because ollama is in the catalog", async () => {
    render(<KeysForm />);
    expect(await screen.findByLabelText("Ollama base URL")).toBeInTheDocument();
  });
});
