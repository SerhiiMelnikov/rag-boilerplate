import { EMBEDDING_DIMENSIONS } from "@/lib/providers/embedding";
import { pineconeClient, PINECONE_DENSE_INDEX, PINECONE_SPARSE_INDEX } from "./client";

// Idempotently create the two serverless indexes: dense (cosine, 768) with
// app-supplied vectors, and sparse using Pinecone's hosted sparse model over the
// "text" field.
export async function ensurePineconeIndexes(pc = pineconeClient()): Promise<void> {
  const cloud = process.env.PINECONE_CLOUD || "aws";
  const region = process.env.PINECONE_REGION || "us-east-1";
  const { indexes } = await pc.listIndexes();
  const names = new Set((indexes ?? []).map((i) => i.name));

  if (!names.has(PINECONE_DENSE_INDEX)) {
    await pc.createIndex({
      name: PINECONE_DENSE_INDEX,
      dimension: EMBEDDING_DIMENSIONS,
      metric: "cosine",
      spec: { serverless: { cloud, region } },
      waitUntilReady: true,
    } as never);
  }
  if (!names.has(PINECONE_SPARSE_INDEX)) {
    await pc.createIndexForModel({
      name: PINECONE_SPARSE_INDEX,
      cloud,
      region,
      embed: { model: "pinecone-sparse-english-v0", fieldMap: { text: "text" } },
      waitUntilReady: true,
    } as never);
  }
}
