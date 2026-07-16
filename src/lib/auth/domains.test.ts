import { describe, it, expect } from "vitest";
import { isEmailDomainAllowed } from "./domains";

describe("isEmailDomainAllowed", () => {
  it("allows an exact domain match", () => {
    expect(isEmailDomainAllowed("a@company.com", "company.com")).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(isEmailDomainAllowed("A@Company.COM", " COMPANY.com ")).toBe(true);
  });

  it("accepts any of several domains", () => {
    expect(isEmailDomainAllowed("a@b.io", "company.com, b.io ,c.net")).toBe(true);
  });

  // The whole point of the gate: an empty list is not "allow all".
  it("denies everything when the list is empty", () => {
    expect(isEmailDomainAllowed("a@company.com", "")).toBe(false);
    expect(isEmailDomainAllowed("a@company.com", "   ")).toBe(false);
  });

  // The attack this function exists to stop.
  it("does not match a lookalike or a suffix", () => {
    expect(isEmailDomainAllowed("a@evil-company.com", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("a@company.com.evil.net", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("a@sub.company.com", "company.com")).toBe(false);
  });

  it("tolerates a leading @ in the configured list", () => {
    expect(isEmailDomainAllowed("a@company.com", "@company.com")).toBe(true);
  });

  it("rejects malformed input rather than throwing", () => {
    expect(isEmailDomainAllowed("not-an-email", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("a@", "company.com")).toBe(false);
  });
});
