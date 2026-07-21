import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { prunePackageJson, removeTestTooling, pruneDockerCompose, pruneEnvExampleStores, generateEnv, generateSecret, setDbImage, setAppEnvOverrides, rewriteScriptsForApiOnly, removeServerScripts } from "./config.js";

const PKG = JSON.stringify({ dependencies: { "@ai-sdk/google": "1", "@ai-sdk/openai": "1", "chromadb": "1", "next": "15" } }, null, 2);

describe("prunePackageJson", () => {
  it("removes only the listed deps and preserves formatting keys", () => {
    const out = JSON.parse(prunePackageJson(PKG, ["@ai-sdk/openai", "chromadb"]));
    expect(out.dependencies["@ai-sdk/openai"]).toBeUndefined();
    expect(out.dependencies["chromadb"]).toBeUndefined();
    expect(out.dependencies["@ai-sdk/google"]).toBe("1");
    expect(out.dependencies["next"]).toBe("15");
  });
});

const PKG_WITH_TEST_TOOLING = JSON.stringify(
  {
    scripts: {
      dev: "next dev",
      build: "next build",
      test: "vitest run",
      "test:watch": "vitest",
      "test:integration": "RUN_INTEGRATION=1 vitest run --config vitest.integration.config.ts",
    },
    dependencies: { next: "15" },
    devDependencies: {
      "@testing-library/dom": "1",
      "@testing-library/jest-dom": "1",
      "@testing-library/react": "1",
      "@testing-library/user-event": "1",
      "@vitejs/plugin-react": "1",
      jsdom: "1",
      vitest: "1",
      typescript: "5",
    },
  },
  null,
  2
);

describe("removeTestTooling", () => {
  it("removes exactly the template's test scripts and test-only devDependencies, preserving the rest", () => {
    const out = JSON.parse(removeTestTooling(PKG_WITH_TEST_TOOLING));
    expect(out.scripts.test).toBeUndefined();
    expect(out.scripts["test:watch"]).toBeUndefined();
    expect(out.scripts["test:integration"]).toBeUndefined();
    expect(out.scripts.dev).toBe("next dev");
    expect(out.scripts.build).toBe("next build");
    expect(out.devDependencies["@testing-library/dom"]).toBeUndefined();
    expect(out.devDependencies["@testing-library/jest-dom"]).toBeUndefined();
    expect(out.devDependencies["@testing-library/react"]).toBeUndefined();
    expect(out.devDependencies["@testing-library/user-event"]).toBeUndefined();
    expect(out.devDependencies["@vitejs/plugin-react"]).toBeUndefined();
    expect(out.devDependencies["jsdom"]).toBeUndefined();
    expect(out.devDependencies["vitest"]).toBeUndefined();
    expect(out.devDependencies["typescript"]).toBe("5");
    expect(out.dependencies["next"]).toBe("15");
  });
});

const PKG_WITH_SERVER_SCRIPTS = JSON.stringify(
  {
    scripts: {
      dev: "next dev", build: "next build", start: "next start",
      "server:dev": "tsx watch src/server/index.ts", "server:build": "tsc --noEmit", "server:start": "tsx src/server/index.ts",
      lint: "eslint .",
    },
  },
  null,
  2,
);

describe("rewriteScriptsForApiOnly", () => {
  it("points dev/build/start at the standalone server and drops the now-redundant server:* trio", () => {
    const out = JSON.parse(rewriteScriptsForApiOnly(PKG_WITH_SERVER_SCRIPTS));
    expect(out.scripts.dev).toBe("tsx watch src/server/index.ts");
    expect(out.scripts.build).toBe("tsc --noEmit");
    expect(out.scripts.start).toBe("tsx src/server/index.ts");
    expect(out.scripts["server:dev"]).toBeUndefined();
    expect(out.scripts["server:build"]).toBeUndefined();
    expect(out.scripts["server:start"]).toBeUndefined();
    expect(out.scripts.lint).toBe("eslint ."); // untouched
  });
});

describe("removeServerScripts", () => {
  it("drops only the server:* trio, leaving the Next scripts untouched", () => {
    const out = JSON.parse(removeServerScripts(PKG_WITH_SERVER_SCRIPTS));
    expect(out.scripts.dev).toBe("next dev");
    expect(out.scripts.build).toBe("next build");
    expect(out.scripts.start).toBe("next start");
    expect(out.scripts["server:dev"]).toBeUndefined();
    expect(out.scripts["server:build"]).toBeUndefined();
    expect(out.scripts["server:start"]).toBeUndefined();
  });

  it("is a no-op when there are no scripts at all", () => {
    expect(() => removeServerScripts(JSON.stringify({ name: "x" }))).not.toThrow();
  });
});

const COMPOSE = `services:
  db:
    image: pgvector/pgvector:pg16
    volumes:
      - rag_pgdata:/var/lib/postgresql/data
  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - rag_qdrant:/qdrant/storage
  chroma:
    image: chromadb/chroma:latest
    volumes:
      - rag_chroma:/data
volumes:
  rag_pgdata:
  rag_qdrant:
  rag_chroma:
`;

describe("pruneDockerCompose", () => {
  it("keeps only the named services and drops orphaned volumes", () => {
    const out = pruneDockerCompose(COMPOSE, ["db", "qdrant"]);
    expect(out).toContain("db:");
    expect(out).toContain("qdrant:");
    expect(out).not.toContain("chroma:");
    expect(out).not.toContain("rag_chroma");
    expect(out).toContain("rag_pgdata");
    expect(out).toContain("rag_qdrant");
  });
});

const ENV = `DATABASE_URL=postgres://x
# Vector store backend: pgvector | qdrant | chroma | weaviate | pinecone

# --- Qdrant (VECTOR_STORE=qdrant) ---
# QDRANT_URL=http://localhost:6333

# --- Chroma (VECTOR_STORE=chroma) ---
# CHROMA_URL=http://localhost:8000
`;

describe("pruneEnvExampleStores", () => {
  it("keeps the chosen store block and removes the others", () => {
    const out = pruneEnvExampleStores(ENV, "qdrant");
    expect(out).toContain("QDRANT_URL");
    expect(out).not.toContain("CHROMA_URL");
    expect(out).toContain("DATABASE_URL");
  });
});

describe("generateSecret", () => {
  it("produces distinct base64 strings", () => {
    expect(generateSecret()).not.toBe(generateSecret());
    expect(generateSecret().length).toBeGreaterThan(20);
  });
});

describe("generateEnv", () => {
  it("writes VECTOR_STORE, store env, and the two secrets", () => {
    const out = generateEnv({ vectorStore: "qdrant" }, { authSecret: "A", encryptionKey: "B" });
    expect(out).toContain("VECTOR_STORE=qdrant");
    expect(out).toContain("QDRANT_URL=");
    expect(out).toContain("AUTH_SECRET=A");
    expect(out).toContain("SETTINGS_ENCRYPTION_KEY=B");
  });

  // Without this line, `docker compose --profile app up` (NODE_ENV=production
  // there) 503s on the very first registration until someone hand-edits .env —
  // it must at least be discoverable. Commented, not live: a plain `npm run
  // dev` needs no AUTH_URL at all (it falls back to the request's own origin).
  it("documents AUTH_URL as required in production, commented out by default", () => {
    const out = generateEnv({ vectorStore: "pgvector" }, { authSecret: "A", encryptionKey: "B" });
    expect(out).toContain("# AUTH_URL=");
    expect(out).not.toMatch(/^AUTH_URL=/m);
  });

  it("omits VECTOR_STORE detail lines for pgvector (default)", () => {
    const out = generateEnv({ vectorStore: "pgvector" }, { authSecret: "A", encryptionKey: "B" });
    expect(out).toContain("VECTOR_STORE=pgvector");
    expect(out).not.toContain("QDRANT_URL");
  });
});

describe("generateEnv S3", () => {
  it("always writes the S3 vars regardless of vector store", () => {
    const env = generateEnv({ vectorStore: "qdrant" }, { authSecret: "a", encryptionKey: "e" });
    expect(env).toContain("S3_ENDPOINT=http://localhost:9000");
    expect(env).toContain("S3_BUCKET=rag-images");
    expect(env).toContain("S3_FORCE_PATH_STYLE=true");
  });
});

describe("setDbImage", () => {
  it("rewrites the db service image and leaves other services intact", () => {
    const out = setDbImage(COMPOSE, "postgres:16");
    expect(out).toContain("image: postgres:16");
    expect(out).not.toContain("pgvector/pgvector:pg16");
    // qdrant service (in COMPOSE) is untouched
    expect(out).toContain("qdrant/qdrant:latest");
  });

  it("is a no-op when there is no db service", () => {
    const out = setDbImage("services:\n  qdrant:\n    image: q\n", "postgres:16");
    expect(out).not.toContain("postgres:16");
    expect(out).toContain("image: q");
  });
});

const COMPOSE_WITH_APP = `services:
  app:
    profiles: ["app"]
    build: .
    environment:
      DATABASE_URL: postgres://rag:rag@db:5432/rag
`;

describe("setAppEnvOverrides", () => {
  it("merges the given vars into the app service's environment block", () => {
    const out = setAppEnvOverrides(COMPOSE_WITH_APP, { QDRANT_URL: "http://qdrant:6333" });
    const doc = parseYaml(out) as { services: { app: { environment: Record<string, string> } } };
    expect(doc.services.app.environment.QDRANT_URL).toBe("http://qdrant:6333");
    // the pre-existing override survives the merge
    expect(doc.services.app.environment.DATABASE_URL).toBe("postgres://rag:rag@db:5432/rag");
  });

  it("is a no-op for a null overrides map (pgvector, pinecone)", () => {
    const out = setAppEnvOverrides(COMPOSE_WITH_APP, null);
    expect(out).toBe(COMPOSE_WITH_APP); // untouched, not even round-tripped through the YAML parser
  });

  it("is a no-op for an empty overrides map", () => {
    const out = setAppEnvOverrides(COMPOSE_WITH_APP, {});
    expect(out).toBe(COMPOSE_WITH_APP);
  });

  it("is a no-op when there is no app service", () => {
    const out = setAppEnvOverrides("services:\n  qdrant:\n    image: q\n", { QDRANT_URL: "http://qdrant:6333" });
    expect(out).not.toContain("QDRANT_URL");
  });
});
