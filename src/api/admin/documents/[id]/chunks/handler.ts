import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getVectorStore } from "@/lib/vectorstore";
import type { VectorStore } from "@/lib/vectorstore/types";

// Bounds for the `limit` query param. This endpoint backs a paged chunk preview, not a
// bulk export — an uncapped limit would let a caller pull an entire document's (or,
// requested repeatedly, an entire corpus's) chunks through a single request.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface DocumentChunksDeps {
  getAdmin?: typeof requireAdmin;
  vectorStore?: VectorStore;
}

// Parses the `limit` query param. Absent, empty, non-numeric, or non-positive values
// fall back to the default page size; anything above MAX_LIMIT is clamped down to it.
function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// Parses the `offset` query param. Absent, empty, or non-numeric values default to 0.
// A negative value is rejected (returns null so the caller can 400) rather than being
// silently clamped or passed through to the store as-is.
function parseOffset(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 0;
  return n < 0 ? null : n;
}

// Paged chunk listing for the admin ingestion inspection UI (Task 5). Ordering and the
// nulls-last chunkIndex convention come from VectorStore.listChunks itself (Task 2) —
// this handler only guards, parses paging, and passes the result through unchanged.
export async function getDocumentChunksResponse(id: string, request: Request, deps: DocumentChunksDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const vectorStore = deps.vectorStore ?? getVectorStore();

  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));
  if (offset === null) {
    return Response.json({ error: "offset must not be negative" }, { status: 400 });
  }

  const { rows, total } = await vectorStore.listChunks(id, { limit, offset });
  return Response.json({ rows, total });
}
