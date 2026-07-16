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
});
