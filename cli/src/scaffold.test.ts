import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, settingsDefaultsFor } from "./scaffold";
import type { InstallOptions } from "./options";

let templateDir: string;
let targetParent: string;

beforeEach(async () => {
  templateDir = await mkdtemp(join(tmpdir(), "tpl-"));
  targetParent = await mkdtemp(join(tmpdir(), "tgt-"));
  // minimal template
  await writeFile(join(templateDir, "package.json"), JSON.stringify({ name: "app", dependencies: { "@ai-sdk/google": "1", "@ai-sdk/anthropic": "1", "chromadb": "1", "@qdrant/js-client-rest": "1", next: "15" } }, null, 2));
  await writeFile(join(templateDir, "_gitignore"), "node_modules/\n.env\n");
  await writeFile(join(templateDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  await writeFile(join(templateDir, "docker-compose.yml"), "services:\n  db:\n    image: pg\n    volumes:\n      - rag_pgdata:/x\n  qdrant:\n    image: q\n    volumes:\n      - rag_qdrant:/x\n  chroma:\n    image: c\n    volumes:\n      - rag_chroma:/x\nvolumes:\n  rag_pgdata:\n  rag_qdrant:\n  rag_chroma:\n");
  await writeFile(join(templateDir, ".env.example"), "DATABASE_URL=x\n\n# --- Qdrant (VECTOR_STORE=qdrant) ---\n# QDRANT_URL=y\n\n# --- Chroma (VECTOR_STORE=chroma) ---\n# CHROMA_URL=z\n");
  await mkdir(join(templateDir, "src/lib/providers"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/vectorstore/qdrant"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/vectorstore/chroma"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/db"), { recursive: true });
  await mkdir(join(templateDir, "src/components/admin"), { recursive: true });
  // Copy the real fixture source files so the transforms have valid targets.
  await cp(join(process.cwd(), "test-fixtures", "providers-index.ts"), join(templateDir, "src/lib/providers/index.ts"));
  await cp(join(process.cwd(), "test-fixtures", "providers-types.ts"), join(templateDir, "src/lib/providers/types.ts"));
  await cp(join(process.cwd(), "test-fixtures", "vectorstore-index.ts"), join(templateDir, "src/lib/vectorstore/index.ts"));
  await cp(join(process.cwd(), "test-fixtures", "schema.ts"), join(templateDir, "src/lib/db/schema.ts"));
  await cp(join(process.cwd(), "test-fixtures", "settings-form.tsx"), join(templateDir, "src/components/admin/settings-form.tsx"));
  await cp(join(process.cwd(), "test-fixtures", "provider-keys-form.tsx"), join(templateDir, "src/components/admin/provider-keys-form.tsx"));
  await writeFile(join(templateDir, "src/lib/providers/anthropic.ts"), "export const x = 1;");
  await writeFile(join(templateDir, "src/lib/vectorstore/chroma/store.ts"), "export const x = 1;");
});
afterEach(async () => { await rm(templateDir, { recursive: true, force: true }); await rm(targetParent, { recursive: true, force: true }); });

const opts = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "qdrant",
  git: false, install: false, packageManager: "npm", yes: true, ...over,
});

describe("settingsDefaultsFor", () => {
  it("uses the default provider's models; embedding falls back when default can't embed", () => {
    const d = settingsDefaultsFor(opts({ providers: ["anthropic", "google"], defaultProvider: "anthropic" }));
    expect(d.chatProvider).toBe("anthropic");
    expect(d.embeddingProvider).toBe("google"); // anthropic can't embed
  });
});

describe("scaffold", () => {
  it("renames _gitignore, prunes unselected store + provider, writes .env", async () => {
    const target = join(targetParent, "app");
    await scaffold(opts({ providers: ["google"], vectorStore: "qdrant" }), { templateDir, targetDir: target });
    expect(existsSync(join(target, ".gitignore"))).toBe(true);
    expect(existsSync(join(target, "_gitignore"))).toBe(false);
    // pruned: chroma dir + anthropic file
    expect(existsSync(join(target, "src/lib/vectorstore/chroma"))).toBe(false);
    expect(existsSync(join(target, "src/lib/providers/anthropic.ts"))).toBe(false);
    // package.json pruned
    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    expect(pkg.dependencies["chromadb"]).toBeUndefined();
    expect(pkg.dependencies["@ai-sdk/anthropic"]).toBeUndefined();
    expect(pkg.dependencies["@qdrant/js-client-rest"]).toBeDefined();
    // .env written
    const env = await readFile(join(target, ".env"), "utf8");
    expect(env).toContain("VECTOR_STORE=qdrant");
    expect(env).toContain("AUTH_SECRET=");
    // docker pruned
    const dc = await readFile(join(target, "docker-compose.yml"), "utf8");
    expect(dc).not.toContain("chroma:");
    expect(dc).toContain("qdrant:");
  });
});
