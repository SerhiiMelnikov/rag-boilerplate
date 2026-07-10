import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { documents, images, workspaces, documentWorkspaces, imageWorkspaces } from "@/lib/db/schema";

export class FileNotFoundError extends Error {
  constructor() { super("File not found."); this.name = "FileNotFoundError"; }
}
export class UnknownWorkspaceError extends Error {
  constructor() { super("One or more workspaces do not exist."); this.name = "UnknownWorkspaceError"; }
}

export interface FileWorkspace { id: string; name: string; isDefault: boolean }

// Every provided id must exist, checked before any write, so a bad id can never
// leave a partially-applied membership set. Checked as a subset (every requested
// id present in the found set) rather than a count match, since duplicate ids
// collapse via the Set above and would otherwise cause a false mismatch.
async function assertWorkspacesExist(workspaceIds: string[], database: typeof defaultDb): Promise<void> {
  const unique = [...new Set(workspaceIds)];
  if (unique.length === 0) return;
  const found = await database.select({ id: workspaces.id }).from(workspaces).where(inArray(workspaces.id, unique));
  const foundIds = new Set(found.map((f) => f.id));
  if (unique.some((id) => !foundIds.has(id))) throw new UnknownWorkspaceError();
}

export async function setDocumentWorkspaces(
  documentId: string,
  workspaceIds: string[],
  database = defaultDb,
): Promise<void> {
  const [file] = await database.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!file) throw new FileNotFoundError();
  await assertWorkspacesExist(workspaceIds, database);

  const unique = [...new Set(workspaceIds)];
  await database.transaction(async (tx) => {
    // Drop memberships no longer in the set, then add the missing ones.
    await tx.delete(documentWorkspaces).where(
      unique.length === 0
        ? eq(documentWorkspaces.documentId, documentId)
        : and(eq(documentWorkspaces.documentId, documentId), notInArray(documentWorkspaces.workspaceId, unique)),
    );
    if (unique.length > 0) {
      await tx.insert(documentWorkspaces).values(unique.map((workspaceId) => ({ documentId, workspaceId }))).onConflictDoNothing();
    }
  });
}

export async function setImageWorkspaces(
  imageId: string,
  workspaceIds: string[],
  database = defaultDb,
): Promise<void> {
  const [file] = await database.select({ id: images.id }).from(images).where(eq(images.id, imageId)).limit(1);
  if (!file) throw new FileNotFoundError();
  await assertWorkspacesExist(workspaceIds, database);

  const unique = [...new Set(workspaceIds)];
  await database.transaction(async (tx) => {
    await tx.delete(imageWorkspaces).where(
      unique.length === 0
        ? eq(imageWorkspaces.imageId, imageId)
        : and(eq(imageWorkspaces.imageId, imageId), notInArray(imageWorkspaces.workspaceId, unique)),
    );
    if (unique.length > 0) {
      await tx.insert(imageWorkspaces).values(unique.map((workspaceId) => ({ imageId, workspaceId }))).onConflictDoNothing();
    }
  });
}

// Membership of many files at once, for the Files list. Files with no rows are
// simply absent from the maps — callers default them to [].
export async function workspacesForFiles(
  documentIds: string[],
  imageIds: string[],
  database = defaultDb,
): Promise<{ documents: Map<string, FileWorkspace[]>; images: Map<string, FileWorkspace[]> }> {
  const docMap = new Map<string, FileWorkspace[]>();
  const imgMap = new Map<string, FileWorkspace[]>();

  if (documentIds.length > 0) {
    const rows = await database
      .select({ fileId: documentWorkspaces.documentId, id: workspaces.id, name: workspaces.name, isDefault: workspaces.isDefault })
      .from(documentWorkspaces)
      .innerJoin(workspaces, eq(workspaces.id, documentWorkspaces.workspaceId))
      .where(inArray(documentWorkspaces.documentId, documentIds));
    for (const r of rows) {
      const list = docMap.get(r.fileId) ?? [];
      list.push({ id: r.id, name: r.name, isDefault: r.isDefault });
      docMap.set(r.fileId, list);
    }
  }

  if (imageIds.length > 0) {
    const rows = await database
      .select({ fileId: imageWorkspaces.imageId, id: workspaces.id, name: workspaces.name, isDefault: workspaces.isDefault })
      .from(imageWorkspaces)
      .innerJoin(workspaces, eq(workspaces.id, imageWorkspaces.workspaceId))
      .where(inArray(imageWorkspaces.imageId, imageIds));
    for (const r of rows) {
      const list = imgMap.get(r.fileId) ?? [];
      list.push({ id: r.id, name: r.name, isDefault: r.isDefault });
      imgMap.set(r.fileId, list);
    }
  }

  return { documents: docMap, images: imgMap };
}
