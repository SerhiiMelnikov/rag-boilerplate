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
});
