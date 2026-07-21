import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { scaffold, settingsDefaultsFor } from "./scaffold.js";
import type { InstallOptions } from "./options.js";

let templateDir: string;
let targetParent: string;

beforeEach(async () => {
  templateDir = await mkdtemp(join(tmpdir(), "tpl-"));
  targetParent = await mkdtemp(join(tmpdir(), "tgt-"));
  // minimal template
  await writeFile(join(templateDir, "package.json"), JSON.stringify({ name: "app", dependencies: { "@ai-sdk/google": "1", "@ai-sdk/anthropic": "1", "chromadb": "1", "@qdrant/js-client-rest": "1", "weaviate-client": "1", next: "15" } }, null, 2));
  await writeFile(join(templateDir, "_gitignore"), "node_modules/\n.env\n");
  await writeFile(join(templateDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  await writeFile(join(templateDir, "docker-compose.yml"), "services:\n  db:\n    image: pg\n    volumes:\n      - rag_pgdata:/x\n  app:\n    profiles: [\"app\"]\n    build: .\n    environment:\n      DATABASE_URL: postgres://rag:rag@db:5432/rag\n  minio:\n    image: minio/minio:latest\n    volumes:\n      - rag_minio:/x\n  createbuckets:\n    image: minio/mc:latest\n    depends_on:\n      - minio\n  qdrant:\n    image: q\n    volumes:\n      - rag_qdrant:/x\n  chroma:\n    image: c\n    volumes:\n      - rag_chroma:/x\n  weaviate:\n    image: w\n    volumes:\n      - rag_weaviate:/x\nvolumes:\n  rag_pgdata:\n  rag_minio:\n  rag_qdrant:\n  rag_chroma:\n  rag_weaviate:\n");
  await writeFile(join(templateDir, ".env.example"), "DATABASE_URL=x\n\n# --- Qdrant (VECTOR_STORE=qdrant) ---\n# QDRANT_URL=y\n\n# --- Chroma (VECTOR_STORE=chroma) ---\n# CHROMA_URL=z\n");
  await mkdir(join(templateDir, "src/lib/providers"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/vectorstore/qdrant"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/vectorstore/chroma"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/vectorstore/weaviate"), { recursive: true });
  await mkdir(join(templateDir, "src/lib/db"), { recursive: true });
  await mkdir(join(templateDir, "src/components/admin"), { recursive: true });
  await mkdir(join(templateDir, "scripts"), { recursive: true });
  // Copy the real fixture source files so the transforms have valid targets.
  await cp(join(process.cwd(), "test-fixtures", "providers-index.ts"), join(templateDir, "src/lib/providers/index.ts"));
  await cp(join(process.cwd(), "test-fixtures", "providers-types.ts"), join(templateDir, "src/lib/providers/types.ts"));
  await cp(join(process.cwd(), "test-fixtures", "vectorstore-index.ts"), join(templateDir, "src/lib/vectorstore/index.ts"));
  await cp(join(process.cwd(), "test-fixtures", "schema.ts"), join(templateDir, "src/lib/db/schema.ts"));
  await cp(join(process.cwd(), "test-fixtures", "settings-form.tsx"), join(templateDir, "src/components/admin/settings-form.tsx"));
  await cp(join(process.cwd(), "test-fixtures", "provider-keys-form.tsx"), join(templateDir, "src/components/admin/provider-keys-form.tsx"));
  await cp(join(process.cwd(), "test-fixtures", "vectorstore-init.ts"), join(templateDir, "scripts/vectorstore-init.ts"));
  await writeFile(join(templateDir, "src/lib/providers/anthropic.ts"), "export const x = 1;");
  await writeFile(join(templateDir, "src/lib/vectorstore/chroma/store.ts"), "export const x = 1;");
  await writeFile(join(templateDir, "src/lib/vectorstore/weaviate/store.ts"), "export const x = 1;");
});
afterEach(async () => { await rm(templateDir, { recursive: true, force: true }); await rm(targetParent, { recursive: true, force: true }); });

const opts = (over: Partial<InstallOptions> = {}): InstallOptions => ({
  projectName: "app", providers: ["google"], defaultProvider: "google", vectorStore: "qdrant",
  appKind: "full", git: false, install: false, packageManager: "npm", yes: true, ...over,
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

  it("keeps the minio + createbuckets services in the generated compose", async () => {
    const targetDir = join(targetParent, "app-minio");
    await scaffold(opts({ vectorStore: "qdrant" }), { templateDir, targetDir });
    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    expect(dc).toContain("minio:");
    expect(dc).toContain("createbuckets:");
    expect(dc).toContain("rag_minio");
  });

  it("keeps the app service in the generated compose", async () => {
    // scaffold.ts prunes docker-compose to a keep-list. If "app" is not on it, the
    // Docker deployment path silently vanishes from every generated project.
    const targetDir = join(targetParent, "app-service");
    await scaffold(opts({ vectorStore: "qdrant" }), { templateDir, targetDir });
    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    expect(dc).toContain("app:");
    expect(dc).toContain("profiles:");
  });
});

describe("app service env overrides for in-network vector stores", () => {
  // .env writes each self-hosted store's URL as localhost (see generateEnv):
  // correct for `npm run dev` on the host, but inside the app container
  // "localhost" resolves to the container itself, not its neighbors. Every
  // store with its own docker-compose service must have its URL overridden in
  // the app service's `environment:` block to the in-network service name, the
  // same way DATABASE_URL and S3_ENDPOINT already are. Without this, ingest and
  // retrieval fail with ECONNREFUSED even though `/api/health` reports healthy.
  for (const store of ["qdrant", "chroma", "weaviate"] as const) {
    it(`${store}: overrides its URL to the in-network service host, not localhost`, async () => {
      const targetDir = join(targetParent, `app-env-${store}`);
      await scaffold(opts({ vectorStore: store }), { templateDir, targetDir });
      const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
      const doc = parseYaml(dc) as { services: Record<string, { environment?: Record<string, string> }> };
      const appEnv = doc.services.app.environment ?? {};
      const expected: Record<string, string> = {
        qdrant: "http://qdrant:6333",
        chroma: "http://chroma:8000",
        weaviate: "http://weaviate:8080",
      };
      const envKey: Record<string, string> = { qdrant: "QDRANT_URL", chroma: "CHROMA_URL", weaviate: "WEAVIATE_URL" };
      expect(appEnv[envKey[store]]).toBe(expected[store]);
      // The DATABASE_URL override already present in the fixture must survive
      // the merge — this is an additive override, not a replacement.
      expect(appEnv.DATABASE_URL).toBe("postgres://rag:rag@db:5432/rag");
    });
  }

  it("pgvector: does not add any store URL override (DATABASE_URL already covers it)", async () => {
    const targetDir = join(targetParent, "app-env-pgvector");
    await writeFile(
      join(templateDir, "docker-compose.yml"),
      "services:\n  db:\n    image: pgvector/pgvector:pg16\n    volumes:\n      - rag_pgdata:/x\n  app:\n    profiles: [\"app\"]\n    build: .\n    environment:\n      DATABASE_URL: postgres://rag:rag@db:5432/rag\nvolumes:\n  rag_pgdata:\n",
    );
    await scaffold(opts({ vectorStore: "pgvector" }), { templateDir, targetDir });
    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    const doc = parseYaml(dc) as { services: Record<string, { environment?: Record<string, string> }> };
    const appEnv = doc.services.app.environment ?? {};
    expect(appEnv.QDRANT_URL).toBeUndefined();
    expect(appEnv.CHROMA_URL).toBeUndefined();
    expect(appEnv.WEAVIATE_URL).toBeUndefined();
  });

  it("pinecone: does not add any store URL override (reached over the internet)", async () => {
    const targetDir = join(targetParent, "app-env-pinecone");
    await mkdir(join(templateDir, "src/lib/vectorstore/pinecone"), { recursive: true });
    await writeFile(join(templateDir, "src/lib/vectorstore/pinecone/store.ts"), "export const x = 1;");
    await scaffold(opts({ vectorStore: "pinecone" }), { templateDir, targetDir });
    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    const doc = parseYaml(dc) as { services: Record<string, { environment?: Record<string, string> }> };
    const appEnv = doc.services.app.environment ?? {};
    expect(appEnv.QDRANT_URL).toBeUndefined();
    expect(appEnv.CHROMA_URL).toBeUndefined();
    expect(appEnv.WEAVIATE_URL).toBeUndefined();
  });
});

describe("cut pgvector for non-pgvector stores", () => {
  async function setupPgvectorTemplate() {
    // db image starts as pgvector; a drizzle/ dir is present (as the real template ships).
    await writeFile(
      join(templateDir, "docker-compose.yml"),
      "services:\n  db:\n    image: pgvector/pgvector:pg16\n    volumes:\n      - rag_pgdata:/x\n  qdrant:\n    image: q\n    volumes:\n      - rag_qdrant:/x\nvolumes:\n  rag_pgdata:\n  rag_qdrant:\n",
    );
    await mkdir(join(templateDir, "drizzle", "meta"), { recursive: true });
    await writeFile(join(templateDir, "drizzle", "0000_x.sql"), "CREATE EXTENSION vector;\n");
  }

  it("qdrant: swaps db image to postgres:16, deletes drizzle/, strips chunks from schema", async () => {
    await setupPgvectorTemplate();
    const targetDir = join(targetParent, "app");
    await scaffold(opts({ vectorStore: "qdrant" }), { templateDir, targetDir });

    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    expect(dc).toContain("image: postgres:16");
    expect(dc).not.toContain("pgvector/pgvector:pg16");

    expect(existsSync(join(targetDir, "drizzle"))).toBe(false);

    const schema = await readFile(join(targetDir, "src/lib/db/schema.ts"), "utf8");
    expect(schema).not.toContain('pgTable("chunks"');
    expect(schema).not.toContain("EMBEDDING_DIMENSIONS");
  });

  it("pgvector: keeps the pgvector image, drizzle/, and the chunks table", async () => {
    await setupPgvectorTemplate();
    const targetDir = join(targetParent, "app-pg");
    await scaffold(opts({ vectorStore: "pgvector" }), { templateDir, targetDir });

    const dc = await readFile(join(targetDir, "docker-compose.yml"), "utf8");
    expect(dc).toContain("pgvector/pgvector:pg16");

    expect(existsSync(join(targetDir, "drizzle"))).toBe(true);

    const schema = await readFile(join(targetDir, "src/lib/db/schema.ts"), "utf8");
    expect(schema).toContain('pgTable("chunks"');
  });
});

describe("appKind pruning", () => {
  // Extra fixture pieces that only the appKind branch touches: the Next.js/
  // React-only surface deleted for "api", and the standalone server (already
  // shipped in the real template) deleted for "full". Overwrites the base
  // package.json with one carrying the deps/scripts both branches operate on.
  async function setupAppKindFixtures() {
    await writeFile(
      join(templateDir, "package.json"),
      JSON.stringify(
        {
          name: "app",
          scripts: {
            dev: "next dev", build: "next build", start: "next start",
            "server:dev": "tsx watch src/server/index.ts", "server:build": "tsc --noEmit", "server:start": "tsx src/server/index.ts",
            lint: "eslint .",
          },
          dependencies: {
            "@ai-sdk/google": "1", "@ai-sdk/anthropic": "1", "chromadb": "1", "@qdrant/js-client-rest": "1", "weaviate-client": "1",
            next: "15", react: "19", "react-dom": "19", "next-auth": "5", "next-themes": "1",
            "@ai-sdk/react": "1", "@headlessui/react": "1", "lucide-react": "1",
            hono: "4", "@hono/node-server": "2", "@scalar/hono-api-reference": "1", "@auth/core": "0.41.2",
          },
          devDependencies: { tailwindcss: "3", postcss: "8", autoprefixer: "10", "@types/react": "19", "@types/react-dom": "19" },
        },
        null,
        2,
      ),
    );
    await mkdir(join(templateDir, "src/app"), { recursive: true });
    await writeFile(join(templateDir, "src/app/page.tsx"), "export default function Page() { return null; }");
    await writeFile(join(templateDir, "src/app/globals.css"), "body { margin: 0; }");
    await writeFile(join(templateDir, "middleware.ts"), "export const config = {};");
    await writeFile(join(templateDir, "next.config.ts"), "export default {};");
    await writeFile(join(templateDir, "next-env.d.ts"), "// next-env");
    await writeFile(join(templateDir, "tailwind.config.ts"), "export default {};");
    await writeFile(join(templateDir, "postcss.config.mjs"), "export default {};");
    await writeFile(join(templateDir, "src/auth.ts"), "export const auth = 1;");
    await writeFile(join(templateDir, "src/auth.config.ts"), "export const authConfig = 1;");
    await mkdir(join(templateDir, "src/types"), { recursive: true });
    await writeFile(join(templateDir, "src/types/next-auth.d.ts"), "export {};");
    await mkdir(join(templateDir, "src/server"), { recursive: true });
    await writeFile(join(templateDir, "src/server/index.ts"), "export const server = 1;");
    await writeFile(join(templateDir, "Dockerfile"), 'FROM node:22-alpine\nRUN npm run build\nCMD ["node", "server.js"]\n');
  }

  it("appKind api: deletes the Next.js/React surface, keeps src/server, rewrites package.json + Dockerfile", async () => {
    await setupAppKindFixtures();
    const targetDir = join(targetParent, "app-api");
    await scaffold(opts({ appKind: "api", vectorStore: "qdrant" }), { templateDir, targetDir });

    for (const rel of [
      "src/app", "middleware.ts", "next.config.ts", "next-env.d.ts", "tailwind.config.ts", "postcss.config.mjs",
      "src/components", "src/auth.ts", "src/auth.config.ts", "src/types/next-auth.d.ts",
    ]) {
      expect(existsSync(join(targetDir, rel))).toBe(false);
    }
    expect(existsSync(join(targetDir, "src/server"))).toBe(true);
    expect(existsSync(join(targetDir, "src/server/index.ts"))).toBe(true);

    const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
    expect(pkg.dependencies.next).toBeUndefined();
    expect(pkg.dependencies.react).toBeUndefined();
    expect(pkg.dependencies["react-dom"]).toBeUndefined();
    expect(pkg.dependencies["next-auth"]).toBeUndefined();
    expect(pkg.dependencies["next-themes"]).toBeUndefined();
    expect(pkg.dependencies["@ai-sdk/react"]).toBeUndefined();
    expect(pkg.dependencies["@headlessui/react"]).toBeUndefined();
    expect(pkg.dependencies["lucide-react"]).toBeUndefined();
    expect(pkg.devDependencies.tailwindcss).toBeUndefined();
    expect(pkg.devDependencies.postcss).toBeUndefined();
    expect(pkg.devDependencies.autoprefixer).toBeUndefined();
    expect(pkg.devDependencies["@types/react"]).toBeUndefined();
    expect(pkg.dependencies.hono).toBe("4");
    expect(pkg.dependencies["@hono/node-server"]).toBe("2");
    expect(pkg.dependencies["@scalar/hono-api-reference"]).toBe("1");
    expect(pkg.dependencies["@auth/core"]).toBe("0.41.2");
    expect(pkg.scripts.dev).toBe("tsx watch src/server/index.ts");
    expect(pkg.scripts.build).toBe("tsc --noEmit");
    expect(pkg.scripts.start).toBe("tsx src/server/index.ts");
    expect(pkg.scripts["server:dev"]).toBeUndefined();
    expect(pkg.scripts["server:build"]).toBeUndefined();
    expect(pkg.scripts["server:start"]).toBeUndefined();
    expect(pkg.scripts.lint).toBe("eslint ."); // untouched

    const dockerfile = await readFile(join(targetDir, "Dockerfile"), "utf8");
    expect(dockerfile).not.toContain("next build");
    expect(dockerfile).toContain('"start"');
    expect(dockerfile).toContain("/api/health");
  });

  it("appKind full: keeps src/app, deletes src/server, strips the hono deps but keeps @auth/core", async () => {
    await setupAppKindFixtures();
    const targetDir = join(targetParent, "app-full");
    await scaffold(opts({ appKind: "full", vectorStore: "qdrant" }), { templateDir, targetDir });

    expect(existsSync(join(targetDir, "src/app"))).toBe(true);
    expect(existsSync(join(targetDir, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(join(targetDir, "src/server"))).toBe(false);

    const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.dependencies.hono).toBeUndefined();
    expect(pkg.dependencies["@hono/node-server"]).toBeUndefined();
    expect(pkg.dependencies["@scalar/hono-api-reference"]).toBeUndefined();
    expect(pkg.dependencies["@auth/core"]).toBe("0.41.2"); // kept in both modes
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.scripts["server:dev"]).toBeUndefined();
    expect(pkg.scripts["server:build"]).toBeUndefined();
    expect(pkg.scripts["server:start"]).toBeUndefined();

    // Dockerfile is untouched in full-app mode (still the fixture's Next-oriented one).
    const dockerfile = await readFile(join(targetDir, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("npm run build");
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });
});
