-- Full-text index backing the keyword branch of hybrid retrieval.
-- Must match the query expression exactly (to_tsvector('simple', content)) to be used.
CREATE INDEX IF NOT EXISTS "chunks_content_fts_idx" ON "chunks" USING gin (to_tsvector('simple', "content"));
