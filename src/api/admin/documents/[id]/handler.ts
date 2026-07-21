import { requireAdmin, errorToResponse } from "@/lib/auth/guards";
import { deleteDocument } from "@/lib/documents/service";

export interface DocumentItemDeps {
  getAdmin?: typeof requireAdmin;
  deleteDocumentFn?: typeof deleteDocument;
}

export async function deleteDocumentResponse(id: string, request: Request, deps: DocumentItemDeps = {}): Promise<Response> {
  const getAdmin = deps.getAdmin ?? requireAdmin;
  const deleteDocumentFn = deps.deleteDocumentFn ?? deleteDocument;
  try {
    await getAdmin(request);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }
  const ok = await deleteDocumentFn(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
