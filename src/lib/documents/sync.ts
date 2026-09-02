import { readFile } from "node:fs/promises";
import { getRuntimeSettings, type RuntimeSettings } from "@/lib/config/settings-service";
import { getDocumentRepo, getVectorStore } from "@/lib/vectorstore";
import type { DocumentRepo, VectorStore } from "@/lib/vectorstore/types";
import { deleteDocument, listDirectoryDocuments } from "./service";
import { ingestExistingDocument } from "@/lib/rag/ingest";
import { scanDirs, type ScannedFile } from "@/lib/rag/scan-dir";
import { parseDirs } from "@/lib/rag/dirs";
import { createWorkspaceRepo } from "@/lib/workspaces/repo";
import { setDocumentWorkspaces } from "@/lib/workspaces/membership";

export interface SyncPlan { add: string[]; update: string[]; delete: string[]; dirs: string[]; errors: string[] }

interface PlanDeps {
  getSettings?: () => Promise<RuntimeSettings>;
  scan?: (dirs: string[]) => Promise<{ files: ScannedFile[]; errors: string[] }>;
  listExisting?: () => Promise<Array<{ id: string; filename: string; contentHash: string | null }>>;
}

export async function planSync(deps: PlanDeps = {}): Promise<SyncPlan> {
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const scan = deps.scan ?? scanDirs;
  const listExisting = deps.listExisting ?? listDirectoryDocuments;

  const dirs = parseDirs((await getSettings()).documentsDirs);
  if (dirs.length === 0) throw new Error("No documents directories are configured.");

  const { files, errors } = await scan(dirs);
  const scanned = new Map(files.map((f) => [f.path, f.hash]));
  const existing = new Map((await listExisting()).map((d) => [d.filename, d]));

  const add: string[] = [];
  const update: string[] = [];
  for (const [path, hash] of scanned) {
    const prev = existing.get(path);
    if (!prev) add.push(path);
    else if (prev.contentHash !== hash) update.push(path);
  }
  const del = [...existing.keys()].filter((p) => !scanned.has(p));
  return { add: add.sort(), update: update.sort(), delete: del.sort(), dirs, errors };
}

export interface ApplyResult { added: number; updated: number; deleted: number }

interface ApplyDeps {
  plan?: () => Promise<SyncPlan>;
  scanIndex?: () => Promise<Map<string, { hash: string; baseDir: string; root: string }>>;
  listExisting?: () => Promise<Array<{ id: string; filename: string; contentHash: string | null }>>;
  getSettings?: () => Promise<RuntimeSettings>;
  documentRepo?: DocumentRepo;
  vectorStore?: VectorStore;
  deleteDocumentFn?: (id: string, deps?: { vectorStore?: VectorStore }) => Promise<boolean>;
  ingest?: typeof ingestExistingDocument;
  readFileFn?: (p: string) => Promise<Buffer>;
  assignDefaultWorkspace?: (documentId: string) => Promise<void>;
  schedule?: (fn: () => Promise<unknown>) => void;
}

export async function applySync(
  confirmed: { add: string[]; update: string[]; delete: string[] },
  deps: ApplyDeps = {},
): Promise<ApplyResult> {
  const documentRepo = deps.documentRepo ?? getDocumentRepo();
  const vectorStore = deps.vectorStore ?? getVectorStore();
  const deleteDocumentFn = deps.deleteDocumentFn ?? ((id: string) => deleteDocument(id, { vectorStore }));
  const ingest = deps.ingest ?? ingestExistingDocument;
  const readFileFn = deps.readFileFn ?? readFile;
  const getSettings = deps.getSettings ?? getRuntimeSettings;
  const scanIndex = deps.scanIndex ?? (async () => {
    const { files } = await scanDirs(parseDirs((await getSettings()).documentsDirs));
    return new Map(files.map((f) => [f.path, { hash: f.hash, baseDir: f.baseDir, root: f.root }]));
  });
  const listExisting = deps.listExisting ?? listDirectoryDocuments;
  const assignDefaultWorkspace = deps.assignDefaultWorkspace ?? (async (documentId: string) => {
    const repo = createWorkspaceRepo();
    await setDocumentWorkspaces(documentId, [await repo.getDefaultId()]);
  });
  const schedule = deps.schedule ?? ((fn: () => Promise<unknown>) => {
    void Promise.resolve().then(fn).catch((e) => console.error("sync job failed", e));
  });

  // Re-derive server-side truth and intersect: a stale confirmation can never act
  // on a path the server no longer plans to touch.
  const fresh = deps.plan ? await deps.plan() : await planSync({ getSettings, listExisting });
  const freshAdd = new Set(fresh.add);
  const freshUpdate = new Set(fresh.update);
  const freshDelete = new Set(fresh.delete);
  const inAdd = confirmed.add.filter((p) => freshAdd.has(p));
  const inUpdate = confirmed.update.filter((p) => freshUpdate.has(p));
  const inDelete = confirmed.delete.filter((p) => freshDelete.has(p));

  const index = await scanIndex();
  const existing = new Map((await listExisting()).map((d) => [d.filename, d]));
  const settings = await getSettings();

  const ingestOne = (path: string) => {
    const meta = index.get(path);
    if (!meta) return;
    schedule(async () => {
      const { id, created } = await documentRepo.createDocument(path, { source: "directory", contentHash: meta.hash });
      if (created) await assignDefaultWorkspace(id);
      const data = await readFileFn(path);
      await ingest(id, { filename: path, data, baseDir: meta.baseDir, boundary: meta.root }, { documentRepo, vectorStore, settings });
    });
  };

  for (const path of inAdd) ingestOne(path);
  // Update = delete-then-readd. Only act when the file's scanned meta still
  // exists at apply time; if it vanished between plan and apply, deleting the
  // old row would leave nothing re-ingested (data loss), so skip it entirely
  // and do not count it as updated.
  let updated = 0;
  for (const path of inUpdate) {
    if (!index.has(path)) continue;
    const prev = existing.get(path);
    if (prev) await deleteDocumentFn(prev.id, { vectorStore });
    ingestOne(path);
    updated++;
  }
  for (const path of inDelete) {
    const prev = existing.get(path);
    if (prev) await deleteDocumentFn(prev.id, { vectorStore });
  }
  return { added: inAdd.length, updated, deleted: inDelete.length };
}
