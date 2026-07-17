import React from "react";
import { describe, it, expect, vi } from "vitest";
import VerifyPage from "./page";

// Mock the verification check function
vi.mock("@/lib/auth/verification", () => ({
  isVerificationTokenValid: vi.fn(),
}));

import { isVerificationTokenValid } from "@/lib/auth/verification";

describe("VerifyPage", () => {
  it("renders the password form when token is valid", async () => {
    const mockIsVerificationTokenValid = isVerificationTokenValid as ReturnType<typeof vi.fn>;
    mockIsVerificationTokenValid.mockResolvedValue(true);

    const element = await VerifyPage({
      searchParams: Promise.resolve({ token: "valid-token-123" }),
    });

    // Element should be a JSX element. Access its structure to validate.
    expect(element).not.toBeNull();
    if (!React.isValidElement(element)) throw new Error("Expected valid element");
    expect(element.type).toBe("form");

    const formProps = element.props as Record<string, unknown>;
    expect(formProps.method).toBe("POST");
    expect(formProps.action).toBe("/api/auth/verify");

    // Find the hidden input field with the token
    const children = React.Children.toArray(formProps.children as React.ReactNode);
    const hiddenInput = children.find(
      (child) =>
        React.isValidElement(child) &&
        child.type === "input" &&
        (child.props as Record<string, unknown>).type === "hidden" &&
        (child.props as Record<string, unknown>).name === "token"
    );

    expect(hiddenInput).toBeDefined();
    if (React.isValidElement(hiddenInput)) {
      const inputProps = hiddenInput.props as Record<string, unknown>;
      expect(inputProps.value).toBe("valid-token-123");
    }

    // Validate the heading exists
    const heading = children.find(
      (child) =>
        React.isValidElement(child) &&
        child.type === "h1"
    );
    expect(heading).toBeDefined();
  });

  it("renders the error message when token is missing", async () => {
    const mockIsVerificationTokenValid = isVerificationTokenValid as ReturnType<typeof vi.fn>;
    mockIsVerificationTokenValid.mockResolvedValue(false);

    const element = await VerifyPage({
      searchParams: Promise.resolve({ token: undefined }),
    });

    // Element should be a div with the error message
    expect(element).not.toBeNull();
    if (!React.isValidElement(element)) throw new Error("Expected valid element");
    expect(element.type).toBe("div");

    // Verify no form is rendered
    const divProps = element.props as Record<string, unknown>;
    const children = React.Children.toArray(divProps.children as React.ReactNode);
    const form = children.find(
      (child) => React.isValidElement(child) && child.type === "form"
    );
    expect(form).toBeUndefined();
  });

  it("renders the error message when token is invalid", async () => {
    const mockIsVerificationTokenValid = isVerificationTokenValid as ReturnType<typeof vi.fn>;
    mockIsVerificationTokenValid.mockResolvedValue(false);

    const element = await VerifyPage({
      searchParams: Promise.resolve({ token: "invalid-token" }),
    });

    expect(element).not.toBeNull();
    if (!React.isValidElement(element)) throw new Error("Expected valid element");
    expect(element.type).toBe("div");

    // Verify no form is rendered
    const divProps = element.props as Record<string, unknown>;
    const children = React.Children.toArray(divProps.children as React.ReactNode);
    const form = children.find(
      (child) => React.isValidElement(child) && child.type === "form"
    );
    expect(form).toBeUndefined();
  });
});
