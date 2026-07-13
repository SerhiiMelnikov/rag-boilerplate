import { after } from "next/server";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { createImageRepo, type ImageRepo } from "@/lib/images/repo";
import { getObjectStore, type ObjectStore } from "@/lib/images/storage";
import { getImageVectorStore } from "@/lib/vectorstore";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { recaptionImageFromSource } from "@/lib/images/recaption-source";

export interface RecaptionImageDeps {
  getAdmin?: typeof requireAdmin;
  imageRepo?: ImageRepo;
  imageVectorStore?: ImageVectorStore;
  objectStore?: ObjectStore;
  getSettings?: typeof getRuntimeSettings;
  recaption?: typeof recaptionImageFromSource;
  schedule?: (fn: () => Promise<unknown>) => void;
}

// Re-run the vision model on an already-uploaded image. Slow (a model call), so it runs
// in the background and the client polls the Files list for the status to settle.
export async function recaptionImageResponse(id: string, deps: RecaptionImageDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const imageRepo = deps.imageRepo ?? createImageRepo();
  const imageVectorStore = deps.imageVectorStore ?? getImageVectorStore();
  const objectStore = deps.objectStore ?? getObjectStore();
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const recaption = deps.recaption ?? recaptionImageFromSource;
  const schedule = deps.schedule ?? ((fn) => after(fn));

  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  const [record] = await imageRepo.getByIds([id]);
  if (!record) return Response.json({ error: "Not found" }, { status: 404 });

  // Mark it processing synchronously: the client reloads the list as soon as this
  // responds, and a status still reading "ready" would leave it never polling.
  await imageRepo.setStatus(id, "processing");

  const settings = await getSettings();
  schedule(() => recaption(id, { imageRepo, imageVectorStore, objectStore, settings }));

  return Response.json({ status: "processing" });
}
