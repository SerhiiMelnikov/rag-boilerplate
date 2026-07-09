import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { getObjectStore, type ObjectStore } from "@/lib/images/storage";
import { createImageRepo, type ImageRepo } from "@/lib/images/repo";
import { getImageVectorStore } from "@/lib/vectorstore";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { ingestImage } from "@/lib/images/ingest";
import { listImages } from "@/lib/images/service";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";

// Accepted image content types → file extension. Max upload 10 MB.
const ALLOWED: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
const MAX_BYTES = 10 * 1024 * 1024;

export interface UploadImageDeps {
  getAdmin?: typeof requireAdmin;
  objectStore?: ObjectStore;
  imageRepo?: ImageRepo;
  imageVectorStore?: ImageVectorStore;
  workspaceRepo?: WorkspaceRepo;
  getSettings?: typeof getRuntimeSettings;
  ingest?: typeof ingestImage;
  schedule?: (fn: () => Promise<unknown>) => void;
  newId?: () => string;
}

export async function uploadImage(request: Request, deps: UploadImageDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const objectStore = deps.objectStore ?? getObjectStore();
  const imageRepo = deps.imageRepo ?? createImageRepo();
  const imageVectorStore = deps.imageVectorStore ?? getImageVectorStore();
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const ingest = deps.ingest ?? ingestImage;
  const schedule = deps.schedule ?? ((fn) => after(fn));
  const newId = deps.newId ?? randomUUID;

  let admin;
  try {
    admin = await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });

  const ext = ALLOWED[file.type];
  if (!ext) return Response.json({ error: "Unsupported image type" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image too large (max 10 MB)" }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer());
  const storageKey = `images/${newId()}${ext}`;
  await objectStore.put(storageKey, data, file.type);

  const imageId = await imageRepo.createImage({ filename: file.name, storageKey, contentType: file.type, uploadedBy: admin.id });
  await imageRepo.setStatus(imageId, "processing");
  await workspaceRepo.addImageToDefault(imageId);

  const settings = await getSettings();
  schedule(() => ingest(imageId, { data, contentType: file.type }, { imageRepo, imageVectorStore, settings }));

  return Response.json({ imageId, status: "processing" });
}

export async function listImagesResponse(deps: { getAdmin?: typeof requireAdmin } = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  try {
    await getAdmin();
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  return Response.json({ images: await listImages() });
}
