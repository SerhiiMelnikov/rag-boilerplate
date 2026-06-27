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
  it("registers then signs in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "u1" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/password/i), "secret12");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(fetchMock).toHaveBeenCalledWith("/api/register", expect.objectContaining({ method: "POST" }));
    expect(signIn).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
