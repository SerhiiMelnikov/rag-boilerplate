// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ResetPage from "./page";

vi.mock("@/lib/auth/password-reset", () => ({
  isPasswordResetTokenValid: vi.fn(),
}));
import { isPasswordResetTokenValid } from "@/lib/auth/password-reset";

const valid = vi.mocked(isPasswordResetTokenValid);
beforeEach(() => { valid.mockReset(); });

describe("ResetPage", () => {
  it("renders the new-password form for a live token", async () => {
    valid.mockResolvedValue(true);
    render(await ResetPage({ searchParams: Promise.resolve({ token: "tok" }) }));
    expect(screen.getByRole("button", { name: /set password/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("tok")).toBeInTheDocument();
  });

  it("refuses an expired token without offering the form", async () => {
    valid.mockResolvedValue(false);
    render(await ResetPage({ searchParams: Promise.resolve({ token: "tok" }) }));
    expect(screen.queryByRole("button", { name: /set password/i })).not.toBeInTheDocument();
    // Regex is `/or has expired/i`, not `/expired/i`: the heading ("Link
    // expired") and this paragraph ("...or has expired.") both contain
    // "expired", so a bare /expired/i match is ambiguous between two elements.
    expect(screen.getByText(/or has expired/i)).toBeInTheDocument();
  });

  // A GET that consumed the token would let Outlook Safe Links and corporate mail
  // scanners burn the user's only link before they ever opened the mail.
  it("only ever performs the read-only check", async () => {
    valid.mockResolvedValue(true);
    await ResetPage({ searchParams: Promise.resolve({ token: "tok" }) });
    expect(valid).toHaveBeenCalledWith("tok");
  });

  it("treats a missing token as invalid without querying", async () => {
    render(await ResetPage({ searchParams: Promise.resolve({}) }));
    expect(valid).not.toHaveBeenCalled();
    expect(screen.getByText(/or has expired/i)).toBeInTheDocument();
  });
});
