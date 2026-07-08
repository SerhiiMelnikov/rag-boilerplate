import { Pinecone } from "@pinecone-database/pinecone";
import type { PineconeDenseLike, PineconeSparseLike } from "./store";

// Two serverless indexes: dense (app-supplied 768 vectors, cosine) and sparse
// (Pinecone-hosted sparse model over text) for keyword search.
export const PINECONE_DENSE_INDEX = process.env.PINECONE_DENSE_INDEX || "rag-chunks-dense";
export const PINECONE_SPARSE_INDEX = process.env.PINECONE_SPARSE_INDEX || "rag-chunks-sparse";
export const PINECONE_IMAGE_INDEX = process.env.PINECONE_IMAGE_INDEX || "rag-images-dense";

let clientSingleton: Pinecone | null = null;

// Lazily construct the client from PINECONE_API_KEY (throws a clear error if unset).
export function pineconeClient(): Pinecone {
  if (!clientSingleton) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is required when VECTOR_STORE=pinecone.");
    clientSingleton = new Pinecone({ apiKey });
  }
  return clientSingleton;
}

// The real @pinecone-database/pinecone v8 `Index` methods take option OBJECTS
// ({ records }, { ids }, ...) rather than the bare-array shapes the store
// adapter (store.ts) is written against. These thin wrappers translate calls
// to the real SDK internally so the store's PineconeDenseLike/PineconeSparseLike
// interfaces — and its unit tests — stay simple and SDK-shape-agnostic.
export function denseIndex(): PineconeDenseLike {
  const idx = pineconeClient().index(PINECONE_DENSE_INDEX);
  return {
    upsert: (records) => idx.upsert({ records } as never),
    query: (args) => idx.query(args),
    fetch: (ids) => idx.fetch({ ids }),
    // listPaginated's real ListItem.id is typed `string | undefined` (ids are
    // always present in practice); narrow it to the store's stricter shape.
    listPaginated: (args) => idx.listPaginated(args) as never,
    deleteMany: (ids) => idx.deleteMany({ ids }),
  };
}
export function denseImageIndex(): PineconeDenseLike {
  const idx = pineconeClient().index(PINECONE_IMAGE_INDEX);
  return {
    upsert: (records) => idx.upsert({ records } as never),
    query: (args) => idx.query(args),
    fetch: (ids) => idx.fetch({ ids }),
    listPaginated: (args) => idx.listPaginated(args) as never,
    deleteMany: (ids) => idx.deleteMany({ ids }),
  };
}
export function sparseIndex(): PineconeSparseLike {
  const idx = pineconeClient().index(PINECONE_SPARSE_INDEX);
  return {
    upsertRecords: (records) => idx.upsertRecords({ records } as never),
    searchRecords: (args) => idx.searchRecords(args),
    deleteMany: (ids) => idx.deleteMany({ ids }),
  };
}
