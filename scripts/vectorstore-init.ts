import "dotenv/config";
import { ensureQdrantCollection } from "@/lib/vectorstore/qdrant/init";

async function main() {
  if ((process.env.VECTOR_STORE ?? "pgvector") !== "qdrant") {
    console.log("VECTOR_STORE is not 'qdrant' — nothing to initialize.");
    process.exit(0);
  }
  await ensureQdrantCollection();
  console.log("Qdrant collection ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
