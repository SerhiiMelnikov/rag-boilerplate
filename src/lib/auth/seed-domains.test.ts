import { describe, it, expect } from "vitest";
import { domainOf } from "./seed-domains";

describe("domainOf", () => {
  it("extracts a lowercase domain", () => {
    expect(domainOf("Admin@Company.COM")).toBe("company.com");
  });
  it("returns null for a malformed address", () => {
    expect(domainOf("nope")).toBeNull();
    expect(domainOf("a@")).toBeNull();
    expect(domainOf("")).toBeNull();
  });

  // Regression: a trailing dot is valid FQDN root notation and arrives easily from
  // a copy-paste. Without stripping it, seed:admin would seed "company.com." and
  // every real registration from "company.com" would be denied forever.
  it("strips a single trailing dot (FQDN root notation)", () => {
    expect(domainOf("admin@company.com.")).toBe("company.com");
  });

  it("does not strip a double trailing dot (malformed, not root notation)", () => {
    expect(domainOf("admin@company.com..")).toBe("company.com..");
  });
});
