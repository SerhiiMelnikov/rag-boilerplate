import { generateText } from "ai";
import type { RuntimeSettings } from "@/lib/config/settings-service";
import { getImageModel } from "@/lib/providers";
import { embedDocuments } from "@/lib/rag/embeddings";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import type { ImageRepo } from "./repo";

// Exported so the caption prompt can be asserted on, and so a caller can tell what a
// stored caption was produced from.
export const IMAGE_CAPTION_PROMPT =
  "Describe this image in detail for search retrieval. Cover the main subjects, " +
  "scene, any visible text, colors, and notable attributes. " +
  // Living subjects are what users search for by description, and a short caption
  // loses exactly the attributes they search on ("a young muscular man"), so spend
  // the words here.
  "If the image contains a person, an animal, or any other living being, describe it " +
  "as thoroughly as you can: apparent age, build and physique, skin, hair, facial " +
  "features and expression, clothing, pose and action, and any other distinguishing " +
  "attribute. Be specific and factual; do not speculate about identity. " +
  "Output only the description.";

export interface IngestImageDeps {
  caption?: (data: Buffer, contentType: string) => Promise<string>;
  embed?: (texts: string[]) => Promise<number[][]>;
  imageRepo: ImageRepo;
  imageVectorStore: ImageVectorStore;
  settings: RuntimeSettings;
}

export interface IngestImageResult {
  imageId: string;
  status: "ready" | "error";
  error?: string;
}

async function defaultCaption(data: Buffer, contentType: string, settings: RuntimeSettings): Promise<string> {
  const { text } = await generateText({
    model: getImageModel(settings),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_CAPTION_PROMPT },
          { type: "image", image: new Uint8Array(data), mimeType: contentType },
        ],
      },
    ],
  });
  return text;
}

// Caption -> embed -> store vector -> persist caption. Mirrors document ingest:
// never throws; failures are recorded on the row as "error".
export async function ingestImage(
  imageId: string,
  input: { data: Buffer; contentType: string },
  deps: IngestImageDeps,
): Promise<IngestImageResult> {
  const caption = deps.caption ?? ((d: Buffer, ct: string) => defaultCaption(d, ct, deps.settings));
  const embed = deps.embed ?? ((texts: string[]) => embedDocuments(texts, deps.settings));
  const { imageRepo, imageVectorStore } = deps;

  try {
    await imageRepo.setStatus(imageId, "processing");
    const text = (await caption(input.data, input.contentType)).trim();
    if (text.length === 0) throw new Error("image analyzer returned an empty caption");
    const [embedding] = await embed([text]);
    await imageVectorStore.upsertImage({ imageId, embedding });
    await imageRepo.setCaption(imageId, text);
    await imageRepo.setStatus(imageId, "ready");
    return { imageId, status: "ready" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await imageRepo.setStatus(imageId, "error", message);
    return { imageId, status: "error", error: message };
  }
}
