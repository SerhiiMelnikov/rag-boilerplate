import { and, eq, desc } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";

export interface SourceRef {
  documentId: string;
  filename: string;
  chunkId: string;
  score: number;
}

export interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  rating: number | null;
  usage: { promptTokens: number; completionTokens: number } | null;
  createdAt: Date;
}

export async function createConversation(userId: string, title: string, database = defaultDb) {
  const [row] = await database
    .insert(conversations)
    .values({ userId, title })
    .returning({ id: conversations.id });
  return row;
}

export async function listConversations(userId: string, database = defaultDb) {
  return database
    .select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt));
}

export async function getConversationWithMessages(userId: string, id: string, database = defaultDb) {
  const owned = await database
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  if (!owned[0]) return null;
  const msgs = await database
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      sources: messages.sources,
      rating: messages.rating,
      usage: messages.usage,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { id: owned[0].id, title: owned[0].title, messages: msgs as MessageRecord[] };
}

export async function deleteConversation(userId: string, id: string, database = defaultDb) {
  const deleted = await database
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}

export async function addMessage(
  input: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    sources?: SourceRef[];
    usage?: { promptTokens: number; completionTokens: number } | null;
  },
  database = defaultDb,
) {
  const [row] = await database
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      sources: input.sources ?? [],
      usage: input.usage ?? null,
    })
    .returning({ id: messages.id });
  return row;
}

// Returns true if the conversation exists AND belongs to userId.
export async function isConversationOwned(userId: string, id: string, database = defaultDb): Promise<boolean> {
  const rows = await database
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Update a message's rating only if it belongs to a conversation owned by userId.
export async function setRating(userId: string, messageId: string, rating: 1 | -1 | null, database = defaultDb) {
  // Step 1: ownership check — ensure the message belongs to a conversation owned by the given user.
  const owned = await database
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.id, messageId), eq(conversations.userId, userId)))
    .limit(1);
  if (!owned[0]) return false;
  // Step 2: apply the rating update.
  const updated = await database
    .update(messages)
    .set({ rating })
    .where(eq(messages.id, messageId))
    .returning({ id: messages.id });
  return updated.length > 0;
}
