// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AccessForm } from "./access-form";

const MASKED = {
  allowedEmailDomains: "company.com",
  smtpHost: "smtp.example.com", smtpPort: 587, smtpUser: "mailer", smtpFrom: "no-reply@example.com",
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

describe("AccessForm", () => {
  it("keeps the warning that an empty allowlist denies everyone", async () => {
    render(<AccessForm />);
    expect(await screen.findByLabelText("Allowed email domains")).toBeInTheDocument();
    expect(screen.getByText(/Comma-separated\. Empty means nobody can register\./i)).toBeInTheDocument();
  });

  it("renders the SMTP password masked, never binding the stored value into the input", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...MASKED, smtpPassword: { set: true, last4: "5678" } }),
    })) as unknown as typeof fetch;
    render(<AccessForm />);
    const input = (await screen.findByLabelText("SMTP password")) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("••••5678");
    expect(input.type).toBe("password");
  });

  it("does not send smtpPassword when the field is left untouched", async () => {
    render(<AccessForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("smtpHost"));
    expect(putBody()).not.toHaveProperty("smtpPassword");
  });

  it("sends the typed SMTP password, trimmed, only when the admin types one", async () => {
    render(<AccessForm />);
    fireEvent.change(await screen.findByLabelText("SMTP password"), { target: { value: "  new-secret-1234  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("smtpPassword"));
    expect(putBody().smtpPassword).toBe("new-secret-1234");
  });

  it("keeps the typed SMTP password when the save is rejected", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => MASKED })) as unknown as typeof fetch;
    render(<AccessForm />);
    const input = (await screen.findByLabelText("SMTP password")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "new-secret-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    expect(input.value).toBe("new-secret-1234");
  });

  it("saves only the fields this page owns", async () => {
    render(<AccessForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(putBody()).toHaveProperty("allowedEmailDomains"));
    const body = putBody();
    for (const owned of ["allowedEmailDomains", "smtpHost", "smtpPort", "smtpUser", "smtpFrom"]) {
      expect(body, `${owned} belongs to this page`).toHaveProperty(owned);
    }
    for (const foreign of ["chatProvider", "temperature", "systemPrompt", "googleKey", "ollamaBaseUrl"]) {
      expect(body, `${foreign} belongs to another page`).not.toHaveProperty(foreign);
    }
  });

  // The bug this guards: `saved` comes from the hook, which never sees the
  // typed SMTP password — that is local component state. Without gating on
  // that local dirtiness, "Saved" from an earlier successful save would keep
  // showing while an unconfirmed password sits in the input, over a secret
  // that cannot be read back from anywhere.
  it("hides Saved once the admin types an SMTP password, even though the hook still thinks it saved", async () => {
    render(<AccessForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("SMTP password"), { target: { value: "typed-secret" } });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("surfaces a rejected save", async () => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT"
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => MASKED })) as unknown as typeof fetch;
    render(<AccessForm />);
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
  });

  // registrationMode existed briefly on the 6A branch as a settings column gating
  // "open" vs "gated" registration, and was dropped entirely (962565f).
  // Registration is gated unconditionally by the allowed-domains list, so there is
  // no mode to choose at scaffold time or at runtime. It must never come back.
  //
  // Moved here from answering-form.test.tsx: Registration now lives on this page,
  // not Answering, so an AnsweringForm guard could never fail — anyone re-adding
  // registrationMode would put it in this page's Registration card.
  it("never renders a registration-mode field", async () => {
    render(<AccessForm />);
    await screen.findByLabelText("Allowed email domains");
    expect(screen.queryByLabelText(/registration.?mode/i)).toBeNull();
    expect(screen.queryByText(/registrationMode/i)).toBeNull();
  });
});
