// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

import { PasswordForm } from "@/app/(app)/account/password-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PasswordForm", () => {
  it("posts the current and new password to the password endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "old-password-1");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ currentPassword: "old-password-1", newPassword: "new-password-1" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("signs out to the login page on success, since every session is retired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "old-password-1");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login?passwordChanged=1" });
    vi.unstubAllGlobals();
  });

  it("tells the user their current password was wrong on a 401 with 'Invalid credentials'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Invalid credentials" }) }),
    );

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "wrong-password");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not your current password/i);
    expect(signOut).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  // A 401 for any other reason means the session itself was refused — routine
  // since a password change on another device already killed this tab's cookie.
  // That must not be blamed on a mistyped password.
  it("tells the user their session expired on a 401 that is not about the password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "old-password-1");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("surfaces the server's error message for any other failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "That password was used too recently." }) }),
    );

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "old-password-1");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/used too recently/i);
  });

  it("falls back to a generic message when the server sends no error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    render(<PasswordForm />);
    await userEvent.type(screen.getByLabelText(/Current password/i), "old-password-1");
    await userEvent.type(screen.getByLabelText(/New password/i), "new-password-1");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not change the password/i);
  });
});
