import { describe, it, expect } from "vitest";
import { parseArgs, validateSelection, detectPackageManager, EMBEDDING_CAPABLE } from "./options.js";

describe("parseArgs", () => {
  it("parses the project name positional and flags", () => {
    const o = parseArgs(["my-app", "--providers=google,openai", "--vector-store=qdrant", "--no-install", "--no-git"]);
    expect(o.projectName).toBe("my-app");
    expect(o.providers).toEqual(["google", "openai"]);
    expect(o.vectorStore).toBe("qdrant");
    expect(o.install).toBe(false);
    expect(o.git).toBe(false);
  });
  it("sets yes from --yes", () => {
    expect(parseArgs(["--yes"]).yes).toBe(true);
  });
  it("leaves unspecified fields undefined", () => {
    const o = parseArgs(["app"]);
    expect(o.providers).toBeUndefined();
    expect(o.vectorStore).toBeUndefined();
  });
});

describe("validateSelection", () => {
  const base = { providers: ["google"] as const, defaultProvider: "google" as const, vectorStore: "pgvector" as const };
  it("accepts a valid selection", () => {
    expect(validateSelection({ ...base, providers: ["google"] })).toEqual([]);
  });
  it("rejects an empty provider list", () => {
    expect(validateSelection({ ...base, providers: [] })).toContain("Select at least one provider.");
  });
  it("rejects a selection with no embedding-capable provider", () => {
    const errs = validateSelection({ providers: ["anthropic"], defaultProvider: "anthropic", vectorStore: "pgvector" });
    expect(errs.some((e) => /embedding-capable/i.test(e))).toBe(true);
  });
  it("rejects a default provider not in the selection", () => {
    const errs = validateSelection({ providers: ["google"], defaultProvider: "openai", vectorStore: "pgvector" });
    expect(errs.some((e) => /default provider/i.test(e))).toBe(true);
  });
});

describe("detectPackageManager", () => {
  it("detects pnpm/yarn/bun/npm from the user agent", () => {
    expect(detectPackageManager("pnpm/9.0.0 npm/? node/v22")).toBe("pnpm");
    expect(detectPackageManager("yarn/4.0.0")).toBe("yarn");
    expect(detectPackageManager("bun/1.1.0")).toBe("bun");
    expect(detectPackageManager(undefined)).toBe("npm");
  });
});

describe("EMBEDDING_CAPABLE", () => {
  it("is google/openai/ollama (not anthropic)", () => {
    expect(EMBEDDING_CAPABLE).toEqual(["google", "openai", "ollama"]);
    expect(EMBEDDING_CAPABLE).not.toContain("anthropic");
  });
});
