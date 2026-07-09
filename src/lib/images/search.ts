import type { RuntimeSettings } from "@/lib/config/settings-service";
import { embedQuery } from "@/lib/rag/embeddings";
import { getImageVectorStore } from "@/lib/vectorstore";
import type { ImageVectorStore } from "@/lib/vectorstore/types";
import { createImageRepo, type ImageRepo } from "./repo";

export interface ImageSearchHit {
  imageId: string;
  filename: string;
  caption: string;
  score: number;
}

export interface SearchImagesDeps {
  embed?: (text: string) => Promise<number[]>;
  imageVectorStore?: ImageVectorStore;
  imageRepo?: ImageRepo;
  settings: RuntimeSettings;
}

// Over-fetch factor when a workspace allowlist is applied, so post-filtering to
// the in-scope images still leaves enough candidates to fill topN.
const OVERFETCH = 5;

// Embed the query text, cosine-search the image vector store, drop matches below
// minScore and outside the workspace allowlist, then join Postgres metadata
// (filename/caption). Score order preserved.
export async function searchImages(
  queryText: string,
  opts: { topN: number; minScore: number; allowedImageIds?: string[] },
  deps: SearchImagesDeps,
): Promise<ImageSearchHit[]> {
  const allow = opts.allowedImageIds ? new Set(opts.allowedImageIds) : null;
  if (allow && allow.size === 0) return [];

  const embed = deps.embed ?? ((t: string) => embedQuery(t, deps.settings));
  const store = deps.imageVectorStore ?? getImageVectorStore();
  const repo = deps.imageRepo ?? createImageRepo();

  const vector = await embed(queryText);
  const fetchN = allow ? opts.topN * OVERFETCH : opts.topN;
  const matches = (await store.searchImages(vector, fetchN))
    .filter((m) => m.score >= opts.minScore)
    .filter((m) => !allow || allow.has(m.imageId))
    .slice(0, opts.topN);
  if (matches.length === 0) return [];

  const records = await repo.getByIds(matches.map((m) => m.imageId));
  const byId = new Map(records.map((r) => [r.id, r]));
  return matches
    .map((m) => {
      const rec = byId.get(m.imageId);
      return rec ? { imageId: m.imageId, filename: rec.filename, caption: rec.caption, score: m.score } : null;
    })
    .filter((h): h is ImageSearchHit => h !== null);
}
