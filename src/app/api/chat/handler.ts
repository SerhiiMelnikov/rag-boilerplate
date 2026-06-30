import { streamText, createDataStreamResponse, formatDataStreamPart } from "ai";
import { google } from "@ai-sdk/google";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { isConversationOwned, addMessage, setConversationTitleIfDefault } from "@/lib/chat/conversations";
import { getRuntimeSettings } from "@/lib/config/settings-service";
import { prepareContext } from "@/lib/rag/answer";

const NO_CONTEXT_ANSWER =
  "I don't have any relevant information in the knowledge base to answer that.";

// Narrow session type: unit-test mocks only need to return { user } or null,
// without the full NextAuth Session shape (which requires `expires`).
type SessionFn = () => Promise<{ user?: { id?: string; role?: string } | null } | null>;

// Narrow streamText type: only the minimal contract used in handleChat.
type StreamTextLike = (args: Parameters<typeof streamText>[0]) => { toDataStreamResponse: () => Response };

export interface ChatDeps {
  getSession?: SessionFn;
  getSettingsFn?: typeof getRuntimeSettings;
  prepareContextFn?: typeof prepareContext;
  isOwnedFn?: typeof isConversationOwned;
  addMessageFn?: typeof addMessage;
  setTitleFn?: typeof setConversationTitleIfDefault;
  streamTextFn?: StreamTextLike;
}

// Testable core: every collaborator is injectable.
// Exported from handler.ts (not route.ts) so Next.js does not reject it as an invalid route export.
export async function handleChat(request: Request, deps: ChatDeps = {}) {
  const getSettingsFn = deps.getSettingsFn ?? getRuntimeSettings;
  const prepareContextFn = deps.prepareContextFn ?? prepareContext;
  const isOwnedFn = deps.isOwnedFn ?? isConversationOwned;
  const addMessageFn = deps.addMessageFn ?? addMessage;
  const setTitleFn = deps.setTitleFn ?? setConversationTitleIfDefault;
  const streamTextFn = deps.streamTextFn ?? (streamText as unknown as StreamTextLike);

  let user;
  try {
    // Cast to any: our SessionFn is narrower than typeof auth but satisfies
    // the runtime contract (returns { user } or null).
    user = await requireUser({ getSession: deps.getSession as any });
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

  // Set conversation title from the first user message if it's still the default placeholder.
  await setTitleFn(user.id, conversationId, content.slice(0, 60));
  await addMessageFn({ conversationId, role: "user", content });

  const settings = await getSettingsFn();
  // History-aware retrieval: include the last couple of user turns so a
  // pronoun-only follow-up still retrieves the entity from the prior question.
  const retrievalQuery =
    history
      .filter((m) => m.role === "user")
      .slice(-2)
      .map((m) => m.content)
      .join("\n") || content;
  const prepared = await prepareContextFn(retrievalQuery, settings);

  // No-context: stream fallback text without calling the model (budget efficiency).
  if (!prepared.hasContext) {
    await addMessageFn({ conversationId, role: "assistant", content: NO_CONTEXT_ANSWER, sources: [], usage: null });
    return createDataStreamResponse({
      execute: (dataStream) => {
        dataStream.write(formatDataStreamPart("text", NO_CONTEXT_ANSWER));
      },
    });
  }

  const result = streamTextFn({
    model: google(settings.chatModel),
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
        usage: {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
        },
      });
    },
  });

  return result.toDataStreamResponse();
}
