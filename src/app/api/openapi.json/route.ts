import { buildOpenApiDocument } from "@/lib/openapi/document";

// Public: the API contract is not a secret; every documented endpoint enforces its own auth.
export function GET() {
  return Response.json(buildOpenApiDocument());
}
