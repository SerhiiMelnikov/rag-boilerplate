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

  // This function claims to be a security boundary on its own — it must hold even if
  // some future caller stops pre-validating with a real email parser.
  it("rejects a local part that itself contains an @ (ambiguous split)", () => {
    expect(isEmailDomainAllowed("a@b@company.com", "company.com")).toBe(false);
  });

  it("rejects whitespace hiding in the local part or the domain", () => {
    expect(isEmailDomainAllowed("a@ company.com", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("a b@company.com", "company.com")).toBe(false);
    expect(isEmailDomainAllowed("a@company .com", "company.com")).toBe(false);
  });

  // Regression: a trailing dot is valid FQDN root notation. "company.com." and
  // "company.com" are the same domain in DNS, so an ADMIN_EMAIL or an allowlist
  // entry carrying the dotted form must not silently deny everyone.
  it("treats a single trailing dot as the DNS root on either side", () => {
    expect(isEmailDomainAllowed("user@company.com.", "company.com")).toBe(true);
    expect(isEmailDomainAllowed("user@company.com", "company.com.")).toBe(true);
    expect(isEmailDomainAllowed("user@company.com.", "company.com.")).toBe(true);
  });

  // A double trailing dot is not root notation, just malformed — it must keep
  // failing closed rather than being normalised away too.
  it("does not strip a double trailing dot", () => {
    expect(isEmailDomainAllowed("a@company.com..", "company.com")).toBe(false);
  });
});
