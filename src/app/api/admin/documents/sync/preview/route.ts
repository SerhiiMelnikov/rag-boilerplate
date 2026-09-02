import { syncPreviewResponse } from "@/api/admin/documents/sync/handler";
export async function POST(request: Request) { return syncPreviewResponse(request); }
