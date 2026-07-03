import { describe, it, expect, vi } from "vitest";
import { installCommand, nextSteps, runPostInstall } from "./postinstall.js";
import type { InstallOptions } from "./options.js";

const o = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "qdrant",
  git: true, install: true, packageManager: "pnpm", yes: true, ...over,
});

describe("installCommand", () => {
  it("maps package managers to their install command", () => {
    expect(installCommand("npm")).toEqual(["npm", "install"]);
    expect(installCommand("pnpm")).toEqual(["pnpm", "install"]);
    expect(installCommand("yarn")).toEqual(["yarn"]);
    expect(installCommand("bun")).toEqual(["bun", "install"]);
  });
});

describe("nextSteps", () => {
  it("includes vectorstore:init + Node-20 note for qdrant", () => {
    const steps = nextSteps(o({ vectorStore: "qdrant" })).join("\n");
    expect(steps).toMatch(/vectorstore:init/);
    expect(steps).toMatch(/Node 20/);
  });
  it("includes the Pinecone API-key reminder", () => {
    expect(nextSteps(o({ vectorStore: "pinecone" })).join("\n")).toMatch(/PINECONE_API_KEY/);
  });
  it("omits docker up for pgvector-only... still needs db", () => {
    expect(nextSteps(o({ vectorStore: "pgvector" })).join("\n")).toMatch(/db:up/);
  });
});

describe("runPostInstall", () => {
  it("runs git init + install when both enabled", () => {
    const run = vi.fn();
    runPostInstall(o({ git: true, install: true, packageManager: "npm" }), "/tmp/app", run);
    const calls = run.mock.calls.map((c) => c[0] + " " + c[1].join(" "));
    expect(calls.some((c) => c.startsWith("git init"))).toBe(true);
    expect(calls.some((c) => c.startsWith("npm install"))).toBe(true);
  });
  it("skips both when disabled", () => {
    const run = vi.fn();
    runPostInstall(o({ git: false, install: false }), "/tmp/app", run);
    expect(run).not.toHaveBeenCalled();
  });
});
