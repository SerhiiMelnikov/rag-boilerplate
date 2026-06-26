import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { auth } from "@/auth";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { createConversation, addMessage } from "@/lib/chat/conversations";
import { getSettings } from "@/lib/settings/service";
import { prepareContext } from "@/lib/rag/answer";

const NO_CONTEXT_ANSWER =
  "I don't have any relevant information in the knowledge base to answer that.";

// Narrow session type: unit-test mocks only need to return { user } or null,
// without the full NextAuth Session shape (which requires `expires`).
type SessionFn = () => Promise<{ user?: { id?: string; role?: string } | null } | null>;

// Narrow streamText type: the injectable seam only needs the minimal contract
// used in handleChat — accepts the call arguments and returns an object with
// toDataStreamResponse. This lets vi.fn fakes satisfy the type without providing
// the full StreamTextResult shape.
type StreamTextLike = (args: Parameters<typeof streamText>[0]) => { toDataStreamResponse: (opts?: { headers?: Record<string, string> }) => Response };

interface ChatDeps {
  getSession?: SessionFn;
  getSettingsFn?: typeof getSettings;
  prepareContextFn?: typeof prepareContext;
  createConversationFn?: typeof createConversation;
  addMessageFn?: typeof addMessage;
  streamTextFn?: StreamTextLike;
}

// Testable core: every collaborator is injectable.
export async function handleChat(request: Request, deps: ChatDeps = {}) {
  const getSettingsFn = deps.getSettingsFn ?? getSettings;
  const prepareContextFn = deps.prepareContextFn ?? prepareContext;
  const createConversationFn = deps.createConversationFn ?? createConversation;
  const addMessageFn = deps.addMessageFn ?? addMessage;
  const streamTextFn = deps.streamTextFn ?? streamText;

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

  let parsed: { conversationId?: string; content?: unknown };
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
  if (!content) return Response.json({ error: "content is required" }, { status: 400 });

  // Reuse an existing conversation id or create one titled from the first message.
  const conversationId =
    parsed.conversationId ?? (await createConversationFn(user.id, content.slice(0, 60))).id;

  await addMessageFn({ conversationId, role: "user", content });

  const settings = await getSettingsFn();
  const prepared = await prepareContextFn(content, settings);
  const headers = {
    "X-Conversation-Id": conversationId,
    "X-Sources": JSON.stringify(prepared.sources),
  };

  // No-context: skip the model (budget efficiency), persist + return the fallback.
  if (!prepared.hasContext) {
    await addMessageFn({ conversationId, role: "assistant", content: NO_CONTEXT_ANSWER, sources: [], usage: null });
    return new Response(NO_CONTEXT_ANSWER, { status: 200, headers });
  }

  const result = streamTextFn({
    model: google(settings.model),
    system: settings.systemPrompt,
    prompt: `Context:\n${prepared.context}\n\nQuestion: ${content}`,
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

  return result.toDataStreamResponse({ headers });
}

export async function POST(request: Request) {
  return handleChat(request);
}
