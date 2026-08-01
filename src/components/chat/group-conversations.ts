export type ConversationGroupKey = "today" | "yesterday" | "previous7" | "earlier";

export interface ConversationGroup<T> {
  key: ConversationGroupKey;
  label: string;
  items: T[];
}

const LABELS: Record<ConversationGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  previous7: "Previous 7 days",
  earlier: "Earlier",
};

const ORDER: ConversationGroupKey[] = ["today", "yesterday", "previous7", "earlier"];

// Local calendar days, not rolling 24-hour windows: a conversation from 23:59 last
// night belongs under "Yesterday" this morning, which is how a person reads the list.
// `now` is a parameter so the boundaries can be tested instead of hoped for.
export function groupConversations<T extends { createdAt: string }>(
  items: T[],
  now: Date,
): Array<ConversationGroup<T>> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 7);

  const buckets = new Map<ConversationGroupKey, T[]>();
  for (const item of items) {
    const created = new Date(item.createdAt);
    const key: ConversationGroupKey =
      created >= startOfToday ? "today"
      : created >= startOfYesterday ? "yesterday"
      : created >= startOfWeek ? "previous7"
      : "earlier";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    label: LABELS[key],
    items: buckets.get(key) as T[],
  }));
}
