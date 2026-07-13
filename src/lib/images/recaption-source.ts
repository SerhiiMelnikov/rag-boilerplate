import type { RuntimeSettings } from "@/lib/config/settings-service";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import type { ImageRepo } from "./repo";
import type { ObjectStore } from "./storage";
import { ingestImage } from "./ingest";

export interface RecaptionSourceDeps {
  imageRepo: ImageRepo;
  imageVectorStore: ImageVectorStore;
  objectStore: ObjectStore;
  settings: RuntimeSettings;
  ingest?: typeof ingestImage;
}

export interface RecaptionSourceResult {
  imageId: string;
  status: "ready" | "error";
  error?: string;
}

// Regenerate an image's caption from the image itself: the original bytes are already
// in object storage, so the vision model can be re-run without the admin re-uploading
// anything. This is what applies a changed caption prompt to images ingested earlier.
//
// Distinct from reembedImageCaption, which re-embeds a caption the admin typed by hand
// and never looks at the image. Like every background image job, this never throws:
// failures are recorded on the row as "error".
export async function recaptionImageFromSource(
  id: string,
  deps: RecaptionSourceDeps,
): Promise<RecaptionSourceResult> {
  const { imageRepo, imageVectorStore, objectStore, settings } = deps;
  const ingest = deps.ingest ?? ingestImage;

  try {
    const [record] = await imageRepo.getByIds([id]);
    if (!record) throw new Error("image not found");

    const { body } = await objectStore.get(record.storageKey);
    // ingestImage owns the caption -> embed -> upsert -> setCaption -> ready sequence
    // and its own error recording, so re-use it rather than duplicating that flow.
    return await ingest(id, { data: body, contentType: record.contentType }, { imageRepo, imageVectorStore, settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await imageRepo.setStatus(id, "error", message);
    return { imageId: id, status: "error", error: message };
  }
}
