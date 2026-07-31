// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import VerifyPage from "./page";

vi.mock("@/lib/auth/verification", () => ({
  isVerificationTokenValid: vi.fn(),
}));
import { isVerificationTokenValid } from "@/lib/auth/verification";

const valid = vi.mocked(isVerificationTokenValid);
beforeEach(() => { valid.mockReset(); });

describe("VerifyPage", () => {
  it("renders the choose-password form, posting to the verify endpoint, for a live token", async () => {
    valid.mockResolvedValue(true);
    const { container } = render(await VerifyPage({ searchParams: Promise.resolve({ token: "valid-token-123" }) }));

    expect(screen.getByRole("heading", { level: 1, name: /choose your password/i })).toBeInTheDocument();
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "POST");
    expect(form).toHaveAttribute("action", "/api/auth/verify");
    expect(screen.getByRole("button", { name: /set password/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("valid-token-123")).toBeInTheDocument();
  });

  it("refuses a missing token without offering the form", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ token: undefined }) }));

    expect(valid).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /set password/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /link expired/i })).toBeInTheDocument();
    // Regex is `/or has expired/i`, not `/expired/i`: the heading ("Link
    // expired") and this paragraph ("...or has expired.") both contain
    // "expired", so a bare /expired/i match is ambiguous between two elements.
    expect(screen.getByText(/or has expired/i)).toBeInTheDocument();
  });

  it("refuses an invalid token without offering the form", async () => {
    valid.mockResolvedValue(false);
    render(await VerifyPage({ searchParams: Promise.resolve({ token: "invalid-token" }) }));

    expect(screen.queryByRole("button", { name: /set password/i })).not.toBeInTheDocument();
    expect(screen.getByText(/or has expired/i)).toBeInTheDocument();
  });
});
