import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trace only the files the server actually needs into .next/standalone, so the
  // runtime image carries no dev dependencies and no full node_modules.
  output: "standalone",
  // chromadb does a dynamic `require`/`import` of its optional
  // @chroma-core/default-embed (never installed — this project supplies its
  // own embeddings). src/lib/vectorstore/index.ts imports all five store
  // clients statically, so webpack always bundles chromadb.mjs regardless of
  // VECTOR_STORE, and without this, that produces a "Critical dependency:
  // the request of a dependency is an expression" warning plus a "Module not
  // found: Can't resolve '@chroma-core/default-embed'" warning on every dev
  // server start and every build. Marking it external keeps webpack from
  // trying to bundle/resolve it; Node's own require handles it at runtime.
  // The other four store clients (qdrant, weaviate, pinecone, pgvector) do
  // not exhibit this pattern and produce no warnings, so they are left alone.
  serverExternalPackages: ["unpdf", "mammoth", "chromadb"],
  devIndicators: false,
};

export default nextConfig;
