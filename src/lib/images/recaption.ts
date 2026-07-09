import type { RuntimeSettings } from "@/lib/config/settings-service";
import { embedDocuments } from "@/lib/rag/embeddings";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import type { ImageRepo } from "./repo";

export interface ReembedDeps {
  embed?: (texts: string[]) => Promise<number[][]>;
  imageRepo: ImageRepo;
  imageVectorStore: ImageVectorStore;
  settings: RuntimeSettings;
}

export interface ReembedResult {
  imageId: string;
  status: "ready" | "error";
  error?: string;
}

// Re-embed an image from an admin-edited caption. Mirrors ingestImage: never
// throws; failures are recorded on the row as "error". The image bytes in S3 are
// untouched — only the caption + its vector change.
export async function reembedImageCaption(id: string, caption: string, deps: ReembedDeps): Promise<ReembedResult> {
  const embed = deps.embed ?? ((texts: string[]) => embedDocuments(texts, deps.settings));
  const { imageRepo, imageVectorStore } = deps;
  try {
    await imageRepo.setStatus(id, "processing");
    const [embedding] = await embed([caption]);
    await imageVectorStore.upsertImage({ imageId: id, embedding });
    await imageRepo.setCaption(id, caption);
    await imageRepo.setStatus(id, "ready");
    return { imageId: id, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await imageRepo.setStatus(id, "error", message);
    return { imageId: id, status: "error", error: message };
  }
}
