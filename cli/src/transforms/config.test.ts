import { describe, it, expect } from "vitest";
import { prunePackageJson, pruneDockerCompose, pruneEnvExampleStores, generateEnv, generateSecret } from "./config";

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
  it("omits VECTOR_STORE detail lines for pgvector (default)", () => {
    const out = generateEnv({ vectorStore: "pgvector" }, { authSecret: "A", encryptionKey: "B" });
    expect(out).toContain("VECTOR_STORE=pgvector");
    expect(out).not.toContain("QDRANT_URL");
  });
});
