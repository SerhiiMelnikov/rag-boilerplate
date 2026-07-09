import { db as defaultDb } from "@/lib/db/client";
import { documents, images } from "@/lib/db/schema";

export interface FileRow {
  id: string;
  kind: "document" | "image";
  filename: string;
  ext: string;
  status: string;
  error: string | null;
  caption: string | null; // images only; null for documents
  createdAt: Date;
}

// Extension from a filename: lowercased, no leading dot. "" when there is none.
export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 || i === filename.length - 1 ? "" : filename.slice(i + 1).toLowerCase();
}

// Read-time union of the two separate tables into one display list. The tables
// and their pipelines are unchanged — this only merges rows for the admin UI.
export async function listFiles(database = defaultDb): Promise<FileRow[]> {
  const docs = await database
    .select({ id: documents.id, filename: documents.filename, status: documents.status, error: documents.error, createdAt: documents.createdAt })
    .from(documents);
  const imgs = await database
    .select({ id: images.id, filename: images.filename, status: images.status, error: images.error, caption: images.caption, createdAt: images.createdAt })
    .from(images);

  const rows: FileRow[] = [
    ...docs.map((d): FileRow => ({ id: d.id, kind: "document", filename: d.filename, ext: extOf(d.filename), status: d.status, error: d.error, caption: null, createdAt: d.createdAt })),
    ...imgs.map((i): FileRow => ({ id: i.id, kind: "image", filename: i.filename, ext: extOf(i.filename), status: i.status, error: i.error, caption: i.caption, createdAt: i.createdAt })),
  ];
  // Default newest-first; the client re-sorts per the admin's choice.
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
