import { streamText, createDataStreamResponse, formatDataStreamPart } from "ai";
import { google } from "@ai-sdk/google";
import { auth } from "@/auth";
import { requireUser, errorToResponse } from "@/lib/auth/guards";
import { isConversationOwned, addMessage, setConversationTitleIfDefault } from "@/lib/chat/conversations";
import { getSettings } from "@/lib/settings/service";
import { prepareContext } from "@/lib/rag/answer";

const NO_CONTEXT_ANSWER =
  "I don't have any relevant information in the knowledge base to answer that.";

// Narrow session type: unit-test mocks only need to return { user } or null,
// without the full NextAuth Session shape (which requires `expires`).
type SessionFn = () => Promise<{ user?: { id?: string; role?: string } | null } | null>;

// Narrow streamText type: only the minimal contract used in handleChat.
type StreamTextLike = (args: Parameters<typeof streamText>[0]) => { toDataStreamResponse: () => Response };

interface ChatDeps {
  getSession?: SessionFn;
  getSettingsFn?: typeof getSettings;
  prepareContextFn?: typeof prepareContext;
  isOwnedFn?: typeof isConversationOwned;
  addMessageFn?: typeof addMessage;
  setTitleFn?: typeof setConversationTitleIfDefault;
  streamTextFn?: StreamTextLike;
}

// Testable core: every collaborator is injectable.
export async function handleChat(request: Request, deps: ChatDeps = {}) {
  const getSettingsFn = deps.getSettingsFn ?? getSettings;
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

  // Ownership check: 404 if the conversation doesn't belong to this user.
  if (!(await isOwnedFn(user.id, conversationId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Set conversation title from the first user message if it's still the default placeholder.
  await setTitleFn(user.id, conversationId, content.slice(0, 60));
  await addMessageFn({ conversationId, role: "user", content });

  const settings = await getSettingsFn();
  const prepared = await prepareContextFn(content, settings);

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

  return result.toDataStreamResponse();
}

export async function POST(request: Request) {
  return handleChat(request);
}
