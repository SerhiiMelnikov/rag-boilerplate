import { createHash } from "node:crypto";

// Stable content hash used to skip re-embedding unchanged chunks.
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
