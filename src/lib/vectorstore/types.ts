// A chunk as returned by retrieval. score is cosine similarity (kept for
// display/threshold even when the fused rank order differs).
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  score: number;
}

// A chunk as written at ingest time. filename is carried so stores that cannot
// join Postgres (Qdrant) can put it in the point payload.
export interface ChunkInput {
  documentId: string;
  filename: string;
  content: string;
  embedding: number[];
  contentHash: string;
}

// Chunk storage + retrieval. The ONLY thing that varies by backend.
export interface VectorStore {
  upsertChunks(rows: ChunkInput[]): Promise<void>;
  existingHashes(documentId: string): Promise<Set<string>>;
  deleteByDocument(documentId: string): Promise<void>;
  searchVector(embedding: number[], limit: number): Promise<RetrievedChunk[]>;
  searchKeyword(query: string, embedding: number[], limit: number): Promise<RetrievedChunk[]>;
}

// Document metadata. Always Postgres, independent of the vector store.
export interface DocumentRepo {
  createDocument(filename: string): Promise<string>;
  setStatus(id: string, status: string, error?: string): Promise<void>;
}

// --- Image vectors -----------------------------------------------------------
// Image caption embeddings live in the chosen vector store, separate from chunk
// vectors. Metadata (filename, caption, storageKey) lives in Postgres `images`.
export interface ImageVectorInput { imageId: string; embedding: number[]; }
export interface ImageMatch { imageId: string; score: number; } // score = cosine

export interface ImageVectorStore {
  upsertImage(row: ImageVectorInput): Promise<void>;
  searchImages(embedding: number[], limit: number): Promise<ImageMatch[]>;
  deleteImage(imageId: string): Promise<void>;
}
