import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";

// Every query here uses this same window, so the trend and the tables reconcile
// without anyone having to explain why they disagree.
export const USAGE_WINDOW_DAYS = 30;

export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  answers: number;
}

// One row of either breakdown. `id` is null for the "Unassigned" workspace
// bucket; `label` is the user's email or the workspace's name.
export interface UsageRow {
  id: string | null;
  label: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  answers: number;
}

export interface UsageTrendPoint {
  day: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

type Row = Record<string, unknown>;
// Sums are cast ::int in SQL (they arrive as numbers), but coerce defensively —
// the same reason feedback.ts does.
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

// Shared so the four queries cannot drift apart. `m` is the messages alias every
// query below uses, including the ones with no join, precisely so these compose.
//
// `usage is not null` excludes the image path, which streams a canned reply with
// no model call at all (src/api/chat/handler.ts) — those rows have no tokens to
// attribute, so excluding them is correct rather than a gap.
const SCOPE = sql`m.role = 'assistant' and m.usage is not null and m.created_at >= now() - make_interval(days => ${USAGE_WINDOW_DAYS})`;
const PROMPT_SUM = sql`coalesce(sum(coalesce((m.usage->>'promptTokens')::int, 0)), 0)::int`;
const COMPLETION_SUM = sql`coalesce(sum(coalesce((m.usage->>'completionTokens')::int, 0)), 0)::int`;

function toRow(r: Row): Omit<UsageRow, "id" | "label"> {
  const promptTokens = num(r.promptTokens);
  const completionTokens = num(r.completionTokens);
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, answers: num(r.answers) };
}

// Window totals across every answer that recorded usage.
export async function getUsageSummary(database = defaultDb): Promise<UsageSummary> {
  const rows = (await database.execute(sql`
    select ${PROMPT_SUM} as "promptTokens", ${COMPLETION_SUM} as "completionTokens", count(*)::int as answers
    from messages m
    where ${SCOPE}
  `)) as unknown as Row[];
  return toRow(rows[0] ?? {});
}

// Per user, heaviest first. messages -> conversations -> users; deleting a user
// cascades all the way down, so there are no orphan rows to bucket here.
export async function getUsageByUser(database = defaultDb): Promise<UsageRow[]> {
  const rows = (await database.execute(sql`
    select u.id as id, u.email as label,
           ${PROMPT_SUM} as "promptTokens", ${COMPLETION_SUM} as "completionTokens", count(*)::int as answers
    from messages m
    join conversations c on c.id = m.conversation_id
    join users u on u.id = c.user_id
    where ${SCOPE}
    group by u.id, u.email
    order by ${PROMPT_SUM} + ${COMPLETION_SUM} desc, u.email asc
  `)) as unknown as Row[];
  return rows.map((r) => ({ id: String(r.id), label: String(r.label), ...toRow(r) }));
}

// Per workspace, heaviest first. LEFT join on purpose: messages.workspace_id is
// ON DELETE set null, so answers outlive their workspace. They aggregate into one
// "Unassigned" row instead of disappearing — dropping them would make this table
// disagree with the summary above, which reads like a bug in the numbers.
export async function getUsageByWorkspace(database = defaultDb): Promise<UsageRow[]> {
  const rows = (await database.execute(sql`
    select w.id as id, coalesce(w.name, 'Unassigned') as label,
           ${PROMPT_SUM} as "promptTokens", ${COMPLETION_SUM} as "completionTokens", count(*)::int as answers
    from messages m
    left join workspaces w on w.id = m.workspace_id
    where ${SCOPE}
    group by w.id, w.name
    order by ${PROMPT_SUM} + ${COMPLETION_SUM} desc, label asc
  `)) as unknown as Row[];
  return rows.map((r) => ({ id: r.id == null ? null : String(r.id), label: String(r.label), ...toRow(r) }));
}

// Daily tokens. Only days that actually have answers appear, matching the
// feedback trend's behaviour.
export async function getUsageTrend(database = defaultDb): Promise<UsageTrendPoint[]> {
  const rows = (await database.execute(sql`
    select to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD') as day,
           ${PROMPT_SUM} as "promptTokens", ${COMPLETION_SUM} as "completionTokens"
    from messages m
    where ${SCOPE}
    group by 1
    order by 1
  `)) as unknown as Row[];
  return rows.map((r) => {
    const { promptTokens, completionTokens, totalTokens } = toRow(r);
    return { day: String(r.day), promptTokens, completionTokens, totalTokens };
  });
}
