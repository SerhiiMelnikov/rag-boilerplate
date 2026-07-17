// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();
const push = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AuthForm } from "@/components/auth-form";

beforeEach(() => {
  vi.clearAllMocks();
  signIn.mockResolvedValue({ ok: true, error: null });
});

describe("AuthForm login", () => {
  it("calls signIn with credentials and navigates home on success", async () => {
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "secret12");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@b.com", password: "secret12", redirect: false });
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows an error when signIn fails", async () => {
    signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid/i);
  });
});

describe("AuthForm register", () => {
  it("collects only an email — no password field is rendered", () => {
    render(<AuthForm mode="register" />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("submits the email only, and shows a check-your-email confirmation on 201", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 201, json: async () => ({ status: "verification_sent" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "a@b.com" }),
    }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    // Registration no longer logs the user in immediately — there is no password
    // yet, so there is nothing signIn could authenticate with.
    expect(signIn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("surfaces a 409 as 'already registered'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 409, json: async () => ({ error: "Email already registered" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already registered/i);
    vi.unstubAllGlobals();
  });

  it("surfaces a 403 naming the allowed domains", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 403,
      json: async () => ({ error: "That email domain is not allowed to register.", allowedDomains: "company.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@evil.com");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/company\.com/);
    vi.unstubAllGlobals();
  });

  it("surfaces a 503 as unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 503,
      json: async () => ({ error: "Registration is unavailable: email is not configured." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    vi.unstubAllGlobals();
  });
});
