import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";

export interface FeedbackSummary {
  total: number;
  rated: number;
  up: number;
  down: number;
  unrated: number;
  satisfaction: number;
}

export interface NegativeAnswer {
  id: string;
  question: string | null;
  answer: string;
  filenames: string[];
  createdAt: Date;
}

export interface DocumentQuality {
  documentId: string;
  filename: string;
  appearances: number;
  up: number;
  down: number;
  satisfaction: number;
}

export interface TrendPoint {
  day: string;
  up: number;
  down: number;
  satisfaction: number;
}

// Satisfaction ratio; 0 when there are no ratings (avoids divide-by-zero).
export function satisfaction(up: number, down: number): number {
  const total = up + down;
  return total === 0 ? 0 : up / total;
}

type Row = Record<string, unknown>;
// Counts are cast ::int in SQL (arrive as numbers), but coerce defensively.
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

// Overall rating counts across all assistant answers.
export async function getFeedbackSummary(database = defaultDb): Promise<FeedbackSummary> {
  const rows = (await database.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where rating is not null)::int as rated,
      count(*) filter (where rating = 1)::int as up,
      count(*) filter (where rating = -1)::int as down,
      count(*) filter (where rating is null)::int as unrated
    from messages
    where role = 'assistant'
  `)) as unknown as Row[];
  const r = rows[0] ?? {};
  const up = num(r.up);
  const down = num(r.down);
  return {
    total: num(r.total),
    rated: num(r.rated),
    up,
    down,
    unrated: num(r.unrated),
    satisfaction: satisfaction(up, down),
  };
}

// Most recent downvoted answers, each with the preceding user question and the
// distinct source filenames that fed the answer.
export async function getRecentNegative(limit = 20, database = defaultDb): Promise<NegativeAnswer[]> {
  const rows = (await database.execute(sql`
    select
      m.id as id,
      m.content as answer,
      m.created_at as "createdAt",
      m.sources as sources,
      (
        select u.content
        from messages u
        where u.conversation_id = m.conversation_id
          and u.role = 'user'
          and u.created_at < m.created_at
        order by u.created_at desc
        limit 1
      ) as question
    from messages m
    where m.role = 'assistant' and m.rating = -1
    order by m.created_at desc
    limit ${limit}
  `)) as unknown as Row[];
  return rows.map((r) => {
    const src = Array.isArray(r.sources) ? (r.sources as Array<{ filename?: string }>) : [];
    const filenames = [...new Set(src.map((s) => String(s.filename ?? "")).filter(Boolean))];
    return {
      id: String(r.id),
      question: r.question == null ? null : String(r.question),
      answer: String(r.answer ?? ""),
      filenames,
      createdAt: new Date(r.createdAt as string | Date),
    };
  });
}

// Per-document quality: a document inherits the rating of every rated ANSWER in
// whose sources it appears (not every chunk). We fetch one row per
// (answer × cited chunk), then dedupe by (messageId, documentId) and aggregate
// in JS so a document a single answer cites via several chunks counts once.
// Worst (most downvoted) documents first.
export async function getDocumentQuality(database = defaultDb): Promise<DocumentQuality[]> {
  const rows = (await database.execute(sql`
    select
      m.id as "messageId",
      m.rating as rating,
      m.created_at as "createdAt",
      src->>'documentId' as "documentId",
      src->>'filename' as filename
    from messages m, jsonb_array_elements(m.sources) as src
    where m.role = 'assistant' and m.rating is not null
  `)) as unknown as Row[];

  const seen = new Set<string>();
  const perDoc = new Map<string, { filename: string; createdAt: number; up: number; down: number; appearances: number }>();
  for (const r of rows) {
    const documentId = String(r.documentId ?? "");
    if (!documentId) continue;
    const key = `${String(r.messageId)}::${documentId}`;
    if (seen.has(key)) continue; // count each document once per answer
    seen.add(key);
    const rating = num(r.rating);
    const createdAt = new Date(r.createdAt as string | Date).getTime();
    const e = perDoc.get(documentId) ?? { filename: "", createdAt: -Infinity, up: 0, down: 0, appearances: 0 };
    e.appearances += 1;
    if (rating === 1) e.up += 1;
    else if (rating === -1) e.down += 1;
    if (createdAt >= e.createdAt) { e.createdAt = createdAt; e.filename = String(r.filename ?? ""); } // keep most recent filename
    perDoc.set(documentId, e);
  }
  return [...perDoc.entries()]
    .map(([documentId, e]) => ({
      documentId,
      filename: e.filename,
      appearances: e.appearances,
      up: e.up,
      down: e.down,
      satisfaction: satisfaction(e.up, e.down),
    }))
    .sort((a, b) => b.down - a.down || b.appearances - a.appearances);
}

// Daily up/down and satisfaction over the last 30 days of rated answers.
export async function getSatisfactionTrend(database = defaultDb): Promise<TrendPoint[]> {
  const rows = (await database.execute(sql`
    select
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
      count(*) filter (where rating = 1)::int as up,
      count(*) filter (where rating = -1)::int as down
    from messages
    where role = 'assistant' and rating is not null and created_at >= now() - interval '30 days'
    group by 1
    order by 1
  `)) as unknown as Row[];
  return rows.map((r) => {
    const up = num(r.up);
    const down = num(r.down);
    return { day: String(r.day), up, down, satisfaction: satisfaction(up, down) };
  });
}
