import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { createImageRepo, type ImageRepo } from "@/lib/images/repo";
import { getObjectStore, type ObjectStore } from "@/lib/images/storage";

export interface ServeImageDeps {
  getUser?: typeof requireUser;
  imageRepo?: ImageRepo;
  objectStore?: ObjectStore;
}

// Auth-gated image byte serving. Any logged-in user may view admin-uploaded
// images (they are referenced from chat answers). 404 for unknown ids.
export async function serveImage(id: string, request: Request, deps: ServeImageDeps = {}): Promise<Response> {
  const getUser = deps.getUser ?? requireUser;
  const imageRepo = deps.imageRepo ?? createImageRepo();
  const objectStore = deps.objectStore ?? getObjectStore();

  try {
    await getUser(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  const [record] = await imageRepo.getByIds([id]);
  if (!record) return Response.json({ error: "Not found" }, { status: 404 });

  const { body, contentType } = await objectStore.get(record.storageKey);
  // Buffer's ArrayBufferLike generic doesn't structurally match the DOM lib's
  // BodyInit (which wants Uint8Array<ArrayBuffer>) under TS 5.7+, so re-wrap.
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
  });
}
