import "dotenv/config";
import { ensureQdrantCollection, ensureQdrantImageCollection } from "@/lib/vectorstore/qdrant/init";
import { ensureChromaCollection, ensureChromaImageCollection } from "@/lib/vectorstore/chroma/init";
import { ensureWeaviateCollection } from "@/lib/vectorstore/weaviate/init";
import { ensurePineconeIndexes } from "@/lib/vectorstore/pinecone/init";

async function main() {
  const kind = process.env.VECTOR_STORE ?? "pgvector";
  switch (kind) {
    case "qdrant":
      await ensureQdrantCollection();
      await ensureQdrantImageCollection();
      console.log("Qdrant collection ready.");
      break;
    case "chroma":
      await ensureChromaCollection();
      await ensureChromaImageCollection();
      console.log("Chroma collection ready.");
      break;
    case "weaviate":
      await ensureWeaviateCollection();
      console.log("Weaviate collection ready.");
      break;
    case "pinecone":
      await ensurePineconeIndexes();
      console.log("Pinecone indexes ready.");
      break;
    default:
      console.log(`VECTOR_STORE="${kind}" needs no initialization.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
