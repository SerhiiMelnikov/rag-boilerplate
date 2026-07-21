import { describe, it, expect } from "vitest";
import { resolveOptions } from "./prompts.js";
import type { InstallOptions } from "./options.js";

// A fake prompter returns canned answers; --yes / provided flags should bypass it.
const fake = (answers: Partial<InstallOptions>) => ({
  askProjectName: async () => answers.projectName ?? "app",
  askProviders: async () => answers.providers ?? ["google"],
  askDefaultProvider: async () => answers.defaultProvider ?? "google",
  askVectorStore: async () => answers.vectorStore ?? "pgvector",
  askAppKind: async () => answers.appKind ?? "full",
  askPostActions: async () => ({ git: answers.git ?? true, install: answers.install ?? true }),
});

describe("resolveOptions", () => {
  it("fills unspecified fields from the prompter", async () => {
    const o = await resolveOptions({ yes: false }, fake({ projectName: "x", providers: ["google", "openai"], vectorStore: "qdrant" }));
    expect(o.projectName).toBe("x");
    expect(o.providers).toEqual(["google", "openai"]);
    expect(o.vectorStore).toBe("qdrant");
  });
  it("with --yes and a project name, uses defaults without prompting", async () => {
    const o = await resolveOptions({ yes: true, projectName: "x" }, fake({}));
    expect(o.projectName).toBe("x");
    expect(o.providers).toEqual(["google"]);
    expect(o.vectorStore).toBe("pgvector");
    expect(o.defaultProvider).toBe("google");
    expect(o.appKind).toBe("full");
  });
  it("fills appKind from the prompter when not on --yes", async () => {
    const o = await resolveOptions({ yes: false }, fake({ projectName: "x", appKind: "api" }));
    expect(o.appKind).toBe("api");
  });
  it("--app-kind flag bypasses the prompter", async () => {
    const o = await resolveOptions({ yes: false, appKind: "api", projectName: "x" }, fake({ appKind: "full" }));
    expect(o.appKind).toBe("api");
  });
  it("re-validates and throws on an impossible flag combo", async () => {
    await expect(resolveOptions({ yes: true, projectName: "x", providers: ["anthropic"] }, fake({}))).rejects.toThrow(/embedding-capable/i);
  });
});
