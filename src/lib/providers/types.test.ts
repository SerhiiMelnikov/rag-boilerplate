import { describe, it, expect } from "vitest";
import {
  MissingProviderKeyError,
  InvalidProviderKeyError,
  isProviderError,
  isAuthError,
  toProviderError,
} from "./types";

describe("provider errors", () => {
  it("MissingProviderKeyError carries task + provider and a Provider keys hint", () => {
    const e = new MissingProviderKeyError("Chat", "openai");
    expect(e.task).toBe("Chat");
    expect(e.provider).toBe("openai");
    expect(e.message).toMatch(/no API key for provider "openai"/);
    expect(e.message).toMatch(/Admin → Provider keys/);
    expect(isProviderError(e)).toBe(true);
  });

  it("InvalidProviderKeyError is a provider error", () => {
    expect(isProviderError(new InvalidProviderKeyError("Chat", "google"))).toBe(true);
  });

  it("isProviderError is false for a plain error", () => {
    expect(isProviderError(new Error("boom"))).toBe(false);
  });

  it("isAuthError detects 401/403 by statusCode and by message", () => {
    expect(isAuthError({ statusCode: 401 })).toBe(true);
    expect(isAuthError({ statusCode: 403 })).toBe(true);
    expect(isAuthError(new Error("401 Unauthorized"))).toBe(true);
    expect(isAuthError(new Error("some other failure"))).toBe(false);
  });

  it("toProviderError maps auth errors to InvalidProviderKeyError, passes others through", () => {
    const mapped = toProviderError({ statusCode: 403 }, "Ingestion", "google");
    expect(mapped).toBeInstanceOf(InvalidProviderKeyError);
    const plain = new Error("network down");
    expect(toProviderError(plain, "Ingestion", "google")).toBe(plain);
  });
});
