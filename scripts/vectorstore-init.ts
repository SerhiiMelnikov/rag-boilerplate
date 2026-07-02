import "dotenv/config";
import { ensureQdrantCollection } from "@/lib/vectorstore/qdrant/init";
import { ensureChromaCollection } from "@/lib/vectorstore/chroma/init";

async function main() {
  const kind = process.env.VECTOR_STORE ?? "pgvector";
  switch (kind) {
    case "qdrant":
      await ensureQdrantCollection();
      console.log("Qdrant collection ready.");
      break;
    case "chroma":
      await ensureChromaCollection();
      console.log("Chroma collection ready.");
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
