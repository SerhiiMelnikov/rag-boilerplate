import { describe, it, expect } from "vitest";
import { verificationEmail } from "./templates";

describe("verificationEmail", () => {
  it("puts the link in the body", () => {
    const { html } = verificationEmail("https://app.test/api/auth/verify?token=abc");
    expect(html).toContain("https://app.test/api/auth/verify?token=abc");
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
    expect(() => verificationEmail("https://app.test/api/auth/verify?token=abc")).not.toThrow();
  });
});
