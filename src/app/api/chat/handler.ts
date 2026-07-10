import { streamText, createDataStreamResponse, formatDataStreamPart } from "ai";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { getAuthUserById } from "@/lib/auth/users";
import { isConversationOwned, addMessage, setConversationTitleIfDefault } from "@/lib/chat/conversations";
import { getRuntimeSettings } from "@/lib/config/settings-service";
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

// Narrow session type: unit-test mocks only need to return { user } or null,
// without the full NextAuth Session shape (which requires `expires`).
type SessionFn = () => Promise<{ user?: { id?: string; role?: string } | null } | null>;

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
  const routeIntentFn = deps.routeIntentFn ?? routeIntent;
  const searchImagesFn = deps.searchImagesFn ?? searchImages;
  const verifyImageMatchesFn = deps.verifyImageMatchesFn ?? verifyImageMatches;
  const workspaceRepo = deps.workspaceRepo ?? createWorkspaceRepo();

  let user;
  try {
    // Cast to any: our SessionFn is narrower than typeof auth but satisfies
    // the runtime contract (returns { user } or null).
    user = await requireUser({ getSession: deps.getSession as any, getAuthUser: deps.getAuthUser });
  } catch (err) {
    const res = errorToResponse(err);
    if (res) return res;
    throw err;
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

  const settings = await getSettingsFn();
  // History-aware retrieval: include the last couple of user turns so a
  // pronoun-only follow-up still retrieves the entity from the prior question.
  const retrievalQuery =
    history
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.content)
      .join("\n") || content;
  // Persist an assistant message and stream it verbatim (no model call).
  const replyWithMessage = async (textOut: string, images: Array<{ imageId: string; filename: string; score: number }> = []) => {
    await addMessageFn({ conversationId, role: "assistant", content: textOut, sources: [], images, usage: null, workspaceId });
    return createDataStreamResponse({
      execute: (dataStream) => {
        dataStream.write(formatDataStreamPart("text", textOut));
      },
    });
  };

  // Hybrid routing: an image request returns matching images; anything else
  // falls through to the normal document-RAG answer below.
  const intent = await routeIntentFn(content, settings);
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
      matches = (await verifyImageMatchesFn(intent.query, hits, settings)).slice(0, IMAGE_TOP_N);
    } catch (err) {
      if (isProviderError(err)) return replyWithMessage((err as Error).message);
      throw err;
    }
    if (matches.length === 0) return replyWithMessage(NO_IMAGE_ANSWER);
    const images = matches.map((h) => ({ imageId: h.imageId, filename: h.filename, score: h.score }));
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
