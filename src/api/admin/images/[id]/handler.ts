import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { createImageRepo, type ImageRepo } from "@/lib/images/repo";
import { getImageVectorStore } from "@/lib/vectorstore";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { reembedImageCaption } from "@/lib/images/recaption";
import { deleteImage } from "@/lib/images/service";

export interface PatchImageDeps {
  getAdmin?: typeof requireAdmin;
  imageRepo?: ImageRepo;
  imageVectorStore?: ImageVectorStore;
  getSettings?: typeof getRuntimeSettings;
  reembed?: typeof reembedImageCaption;
  schedule?: (fn: () => Promise<unknown>) => void;
}

export async function patchImageCaption(id: string, request: Request, deps: PatchImageDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const imageRepo = deps.imageRepo ?? createImageRepo();
  const imageVectorStore = deps.imageVectorStore ?? getImageVectorStore();
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const reembed = deps.reembed ?? reembedImageCaption;
  const schedule =
    deps.schedule ??
    ((fn: () => Promise<unknown>) => {
      void Promise.resolve()
        .then(fn)
        .catch((e) => console.error("background job failed", e));
    });

  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const caption = typeof (body as { caption?: unknown })?.caption === "string" ? (body as { caption: string }).caption.trim() : "";
  if (!caption) return Response.json({ error: "caption is required" }, { status: 400 });

  const [record] = await imageRepo.getByIds([id]);
  if (!record) return Response.json({ error: "Not found" }, { status: 404 });

  // Flip the status synchronously so an immediate client reload sees "processing"
  // and starts polling; the background job below also sets it (idempotent repeat).
  await imageRepo.setStatus(id, "processing");

  const settings = await getSettings();
  schedule(() => reembed(id, caption, { imageRepo, imageVectorStore, settings }));
  return Response.json({ status: "processing" });
}

export interface DeleteImageResponseDeps {
  getAdmin?: typeof requireAdmin;
  deleteImage?: typeof deleteImage;
}

export async function deleteImageResponse(request: Request, id: string, deps: DeleteImageResponseDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const removeImage = deps.deleteImage ?? deleteImage;

  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const ok = await removeImage(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
