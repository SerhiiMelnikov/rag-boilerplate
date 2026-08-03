import { db as defaultDb } from "@/lib/db/client";
import { documents, images } from "@/lib/db/schema";
import { workspacesForFiles, type FileWorkspace } from "@/lib/workspaces/membership";

export interface FileRow {
  id: string;
  kind: "document" | "image";
  filename: string;
  ext: string;
  status: string;
  error: string | null;
  caption: string | null; // images only; null for documents
  workspaces: FileWorkspace[]; // empty = unassigned (excluded from retrieval)
  createdAt: Date;
}

// Extension from a filename: lowercased, no leading dot. "" when there is none.
//
// A URL-ingested document keeps its URL as its filename, and scanning the whole
// string for the last dot then finds the one in "wikipedia.org" and returns the
// entire path after it. That rendered as a type badge wide enough to push the
// files table sideways. An extension lives in the last path segment and is a
// short alphanumeric token — anything else is not one.
export function extOf(filename: string): string {
  // Parsed as a URL rather than pattern-matched, so the host is never mistaken
  // for a name: "https://example.com" has a dot and a plausible three-letter
  // tail, and only the pathname says it is a domain and not a file.
  let name = filename;
  if (/^https?:\/\//i.test(name)) {
    try {
      name = new URL(name).pathname;
    } catch {
      // A malformed URL is just a filename that happens to start with "http".
    }
  }
  const base = name.slice(name.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  if (i === -1 || i === base.length - 1) return "";
  const ext = base.slice(i + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export interface ListFilesDeps {
  workspacesForFilesFn?: typeof workspacesForFiles;
}

// Read-time union of the two separate tables into one display list. The tables
// and their pipelines are unchanged — this only merges rows for the admin UI.
export async function listFiles(database = defaultDb, deps: ListFilesDeps = {}): Promise<FileRow[]> {
  const membershipOf = deps.workspacesForFilesFn ?? workspacesForFiles;

  const docs = await database
    .select({ id: documents.id, filename: documents.filename, status: documents.status, error: documents.error, createdAt: documents.createdAt })
    .from(documents);
  const imgs = await database
    .select({ id: images.id, filename: images.filename, status: images.status, error: images.error, caption: images.caption, createdAt: images.createdAt })
    .from(images);

  const membership = await membershipOf(docs.map((d) => d.id), imgs.map((i) => i.id), database);

  const rows: FileRow[] = [
    ...docs.map((d): FileRow => ({ id: d.id, kind: "document", filename: d.filename, ext: extOf(d.filename), status: d.status, error: d.error, caption: null, workspaces: membership.documents.get(d.id) ?? [], createdAt: d.createdAt })),
    ...imgs.map((i): FileRow => ({ id: i.id, kind: "image", filename: i.filename, ext: extOf(i.filename), status: i.status, error: i.error, caption: i.caption, workspaces: membership.images.get(i.id) ?? [], createdAt: i.createdAt })),
  ];
  // Default newest-first; the client re-sorts per the admin's choice.
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
