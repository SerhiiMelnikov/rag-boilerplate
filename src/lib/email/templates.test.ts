import { describe, it, expect } from "vitest";
import { verificationEmail, passwordResetEmail } from "./templates";

describe("verificationEmail", () => {
  it("puts the link in the body", () => {
    const { html } = verificationEmail("https://app.test/verify?token=abc");
    expect(html).toContain("https://app.test/verify?token=abc");
  });

  it("has a subject", () => {
    expect(verificationEmail("https://x/y").subject.length).toBeGreaterThan(0);
  });

  // The link is attacker-influenced only via our own construction, but escaping is
  // the difference between a link and an injected tag.
  it("escapes the link rather than interpolating it raw", () => {
    const { html } = verificationEmail('https://x/y?t=a"><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
  });

  // Escaping keeps the link from breaking out of the href attribute, but says
  // nothing about the scheme inside it. Not exploitable via the one caller today
  // (it builds an https:// link server-side), but a guard rail for the future.
  it("rejects a javascript: link", () => {
    expect(() => verificationEmail("javascript:alert(1)")).toThrow();
  });

  it("accepts a valid https: link", () => {
    expect(() => verificationEmail("https://app.test/verify?token=abc")).not.toThrow();
  });
});

describe("passwordResetEmail", () => {
  it("renders the link and does not claim anything has changed yet", () => {
    const { subject, html } = passwordResetEmail("https://app.example/reset?token=abc");
    expect(subject).toBe("Reset your password");
    expect(html).toContain("https://app.example/reset?token=abc");
    expect(html).toContain("1 hour");
    // This mail arrives unsolicited to anyone whose address a stranger typed. It
    // must not read like a completed action.
    expect(html).toContain("your password has not changed");
  });

  it("refuses a non-http(s) link", () => {
    expect(() => passwordResetEmail("javascript:alert(1)")).toThrow();
  });

  it("escapes the link before putting it in an href", () => {
    const { html } = passwordResetEmail('https://app.example/reset?token=a"b');
    expect(html).not.toContain('token=a"b');
    expect(html).toContain("&quot;");
  });
});
