import { streamText, createDataStreamResponse, formatDataStreamPart } from "ai";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getAuthUserById } from "@/lib/auth/users";
import { isConversationOwned, addMessage, setConversationTitleIfDefault } from "@/lib/chat/conversations";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { consume } from "@/lib/ratelimit/store";
import { prepareContext } from "@/lib/rag/answer";
import { getChatModel } from "@/lib/providers";
import { isProviderError } from "@/lib/providers/types";
import { routeIntent } from "@/lib/chat/route-intent";
import { searchImages } from "@/lib/images/search";
import { verifyImageMatches } from "@/lib/images/verify";
import { createWorkspaceRepo, type WorkspaceRepo } from "@/lib/workspaces/repo";
import { resolveActiveWorkspaceId, resolveAllowedDocumentIds, resolveAllowedImageIds } from "@/lib/workspaces/access";
import { parseActiveWorkspaceCookie } from "@/lib/workspaces/cookie";

const NO_CONTEXT_ANSWER =
  "I don't have any relevant information in the knowledge base to answer that.";
const IMAGE_TOP_N = 3;
// Candidates handed to the relevance verifier before trimming to IMAGE_TOP_N.
const IMAGE_CANDIDATES = 8;
// Image relevance is decided by the verifier, not by cosine similarity: a caption is a
// verbose paragraph and a query is a few words, so a genuinely matching caption can
// score below an unrelated one and no absolute threshold separates them (measured: a
// matching "a woman" scored 0.155, an unrelated "database schema diagram" 0.190). The
// text retrieval threshold (settings.minSimilarity, 0.3 by default) is far too high —
// nothing ever reached it. This floor sits well under the observed true-positive range
// and only exists to skip a model call when nothing is even remotely close.
const IMAGE_MIN_SCORE = 0.1;
const IMAGE_INTRO = "Here are the images that best match your description:";
const NO_IMAGE_ANSWER = "I couldn't find any image matching that description.";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Narrow session type: guards.ts now reads the session via getSessionFromRequest
// (flat { id, role, isSuperAdmin }, no NextAuth `.user`/`expires` wrapper), keyed
// off the Request itself rather than async context. Unit-test mocks only need to
// return that flat shape (or null) — see the "cast through unknown" below.
type SessionFn = (request: Request) => Promise<{ id?: string; role?: string } | null>;

// Narrow streamText type: only the minimal contract used in handleChat.
type StreamTextLike = (args: Parameters<typeof streamText>[0]) => { toDataStreamResponse: () => Response };

export interface ChatDeps {
  getSession?: SessionFn;
  getAuthUser?: typeof getAuthUserById;
  getSettingsFn?: typeof getRuntimeSettings;
  prepareContextFn?: typeof prepareContext;
  getChatModelFn?: typeof getChatModel;
  isOwnedFn?: typeof isConversationOwned;
  addMessageFn?: typeof addMessage;
  setTitleFn?: typeof setConversationTitleIfDefault;
  streamTextFn?: StreamTextLike;
  rateLimitFn?: typeof consume;
  routeIntentFn?: typeof routeIntent;
  searchImagesFn?: typeof searchImages;
  verifyImageMatchesFn?: typeof verifyImageMatches;
  workspaceRepo?: WorkspaceRepo;
}

// Testable core: every collaborator is injectable.
// Exported from handler.ts (not route.ts) so Next.js does not reject it as an invalid route export.
export async function handleChat(request: Request, deps: ChatDeps = {}) {
  const getSettingsFn = deps.getSettingsFn ?? getRuntimeSettings;
  const prepareContextFn = deps.prepareContextFn ?? prepareContext;
  const getChatModelFn = deps.getChatModelFn ?? getChatModel;
  const isOwnedFn = deps.isOwnedFn ?? isConversationOwned;
  const addMessageFn = deps.addMessageFn ?? addMessage;
  const setTitleFn = deps.setTitleFn ?? setConversationTitleIfDefault;
  const streamTextFn = deps.streamTextFn ?? (streamText as unknown as StreamTextLike);
  const rateLimitFn = deps.rateLimitFn ?? consume;
  const routeIntentFn = deps.routeIntentFn ?? routeIntent;
  const searchImagesFn = deps.searchImagesFn ?? searchImages;
  const verifyImageMatchesFn = deps.verifyImageMatchesFn ?? verifyImageMatches;
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();

  let user;
  try {
    // Cast through unknown: our SessionFn is narrower than requireUser's GuardDeps
    // (it omits role/isSuperAdmin as required fields) but satisfies the runtime
    // contract used here (requireUser only reads session.id off the result).
    user = await requireUser(request, {
      getSession: deps.getSession,
      getAuthUser: deps.getAuthUser,
    } as unknown as NonNullable<Parameters<typeof requireUser>[1]>);
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
  }

  // Rate limit before any parsing, database work or model call — a limit that runs
  // after the expensive part is not a limit. Two independent buckets: a burst guard
  // and a daily quota. The minute rule is checked first and short-circuits, so a
  // request it already rejected does not also burn a slot of the daily quota.
  const settings = await getSettingsFn();
  for (const [rule, limit, windowMs] of [
    ["minute", settings.chatRateLimitPerMinute, MINUTE_MS],
    ["day", settings.chatRateLimitPerDay, DAY_MS],
  ] as const) {
    const verdict = await rateLimitFn(`chat:${rule}:user:${user.id}`, limit, windowMs);
    if (!verdict.allowed) {
      return Response.json(
        { error: `You have reached the message limit. Try again in ${verdict.retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
      );
    }
  }

  let parsed: { messages?: Array<{ role?: string; content?: unknown }>; conversationId?: unknown };
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Require an explicit conversationId (created via POST /api/conversations before the chat starts).
  const conversationId = typeof parsed.conversationId === "string" ? parsed.conversationId : "";
  if (!conversationId) return Response.json({ error: "conversationId is required" }, { status: 400 });

  // Extract the last user message from the useChat messages array.
  const lastUser = [...(parsed.messages ?? [])].reverse().find((m) => m.role === "user");
  const content = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
  if (!content) return Response.json({ error: "content is required" }, { status: 400 });

  // Conversation history (useChat sends prior turns) so the model has context
  // for follow-ups like "who is his brother?". Capped to bound prompt tokens.
  const MAX_HISTORY_MESSAGES = 10;
  const history = (parsed.messages ?? [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-MAX_HISTORY_MESSAGES);

  // Ownership check: 404 if the conversation doesn't belong to this user.
  if (!(await isOwnedFn(user.id, conversationId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve the active workspace from the cookie, sanitized to one the user can
  // see (else General), then the allowlists that scope retrieval to it + General.
  const requestedWorkspaceId = parseActiveWorkspaceCookie(request);
  const workspaceId = await resolveActiveWorkspaceId(requestedWorkspaceId, user.id, workspaceRepo);
  const [allowedDocumentIds, allowedImageIds] = await Promise.all([
    resolveAllowedDocumentIds(workspaceId, workspaceRepo),
    resolveAllowedImageIds(workspaceId, workspaceRepo),
  ]);

  // Set conversation title from the first user message if it's still the default placeholder.
  await setTitleFn(user.id, conversationId, content.slice(0, 60));
  await addMessageFn({ conversationId, role: "user", content, workspaceId });

  // History-aware retrieval: include the last couple of user turns so a
  // pronoun-only follow-up still retrieves the entity from the prior question.
  const retrievalQuery =
    history
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.content)
      .join("\n") || content;
  // Persist an assistant message and stream it verbatim (no model call).
  const replyWithMessage = async (textOut: string, images: Array<{ imageId: string; caption: string }> = []) => {
    await addMessageFn({ conversationId, role: "assistant", content: textOut, sources: [], images, usage: null, workspaceId });
    return createDataStreamResponse({
      execute: (dataStream) => {
        dataStream.write(formatDataStreamPart("text", textOut));
      },
    });
  };

  // Hybrid routing: an image request returns matching images; anything else
  // falls through to the normal document-RAG answer below.
  let intent;
  try {
    intent = await routeIntentFn(content, settings);
  } catch (err) {
    if (isProviderError(err)) return replyWithMessage((err as Error).message);
    throw err;
  }
  if (intent.kind === "image") {
    let matches;
    try {
      // searchImages applies the workspace allowlist, so the verifier only ever sees
      // in-scope captions. Keep that order: it is what stops an injected caption from
      // pulling in another workspace's image.
      const hits = await searchImagesFn(intent.query, { topN: IMAGE_CANDIDATES, minScore: IMAGE_MIN_SCORE, allowedImageIds }, { settings });
      // The vector search only ranks; the verifier decides which captions actually
      // answer the request, so we never present an image we cannot vouch for. Its
      // relevance order wins over cosine order, hence the trim happens after it.
      const displayCount =
        intent.count != null ? Math.min(Math.max(intent.count, 1), IMAGE_CANDIDATES) : IMAGE_TOP_N;
      matches = (await verifyImageMatchesFn(intent.query, hits, settings)).slice(0, displayCount);
    } catch (err) {
      if (isProviderError(err)) return replyWithMessage((err as Error).message);
      throw err;
    }
    if (matches.length === 0) return replyWithMessage(NO_IMAGE_ANSWER);
    const images = matches.map((h) => ({ imageId: h.imageId, caption: h.caption }));
    return replyWithMessage(IMAGE_INTRO, images);
  }

  let prepared;
  try {
    prepared = await prepareContextFn(retrievalQuery, settings, { allowedDocumentIds });
  } catch (err) {
    if (isProviderError(err)) return replyWithMessage((err as Error).message);
    throw err;
  }

  // No-context: stream fallback text without calling the model (budget efficiency).
  if (!prepared.hasContext) {
    return replyWithMessage(NO_CONTEXT_ANSWER);
  }

  let chatModel;
  try {
    chatModel = getChatModelFn(settings);
  } catch (err) {
    if (isProviderError(err)) return replyWithMessage((err as Error).message);
    throw err;
  }

  const result = streamTextFn({
    model: chatModel,
    // Retrieved context goes in the system prompt; the actual turn-by-turn
    // conversation is passed as messages so the model keeps context across turns.
    system: `${settings.systemPrompt}\n\nUse the following context to answer the user's latest question. If the answer is not in the context, say you don't know.\n\nContext:\n${prepared.context}`,
    messages: history,
    temperature: settings.temperature,
    onFinish: async ({ text, usage }: { text: string; usage?: { promptTokens?: number; completionTokens?: number } }) => {
      await addMessageFn({
        conversationId,
        role: "assistant",
        content: text,
        sources: prepared.sources,
        workspaceId,
        usage: {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
        },
      });
    },
  });

  return result.toDataStreamResponse();
}
