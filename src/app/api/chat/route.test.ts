import { describe, it, expect, vi } from "vitest";
import { handleChat } from "@/app/api/chat/route";
import { UnauthorizedError } from "@/lib/auth/guards";

const settings = { topK: 5, model: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };
const body = (b: unknown) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
});

function baseDeps(over: Partial<any> = {}) {
  return {
    getSession: vi.fn(async () => ({ user: { id: "u1", role: "user" } })),
    getSettingsFn: vi.fn(async () => settings),
    prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "ctx", sources: [{ documentId: "d", filename: "f.md", chunkId: "c", score: 0.9 }] })),
    createConversationFn: vi.fn(async () => ({ id: "c1" })),
    addMessageFn: vi.fn(async () => ({ id: "m1" })),
    isOwnedFn: vi.fn(async () => true),
    // Fake streamText: returns an object exposing toDataStreamResponse + triggers onFinish.
    streamTextFn: vi.fn((args: any) => {
      // simulate completion so persistence runs
      args.onFinish?.({ text: "answer", usage: { promptTokens: 10, completionTokens: 3 } });
      return { toDataStreamResponse: (opts: any) => new Response("stream", { status: 200, headers: opts?.headers }) };
    }),
    ...over,
  };
}

describe("handleChat", () => {
  it("401 without a session", async () => {
    const deps = baseDeps({ getSession: vi.fn(async () => null) });
    const res = await handleChat(body({ content: "hi" }), deps);
    expect(res.status).toBe(401);
  });

  it("400 on empty content", async () => {
    const res = await handleChat(body({ content: "" }), baseDeps());
    expect(res.status).toBe(400);
  });

  it("creates a conversation, persists user+assistant messages, returns headers", async () => {
    const deps = baseDeps();
    const res = await handleChat(body({ content: "why is the sky blue?" }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Conversation-Id")).toBe("c1");
    expect(deps.createConversationFn).toHaveBeenCalledWith("u1", expect.any(String));
    // user message persisted, then assistant message persisted with sources + usage
    expect(deps.addMessageFn).toHaveBeenCalledTimes(2);
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ conversationId: "c1", role: "user", content: "why is the sky blue?" }));
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", content: "answer", usage: { promptTokens: 10, completionTokens: 3 } }));
    expect(deps.streamTextFn).toHaveBeenCalled();
  });

  it("no-context: does not call the model, persists the fallback answer", async () => {
    const deps = baseDeps({ prepareContextFn: vi.fn(async () => ({ hasContext: false, context: "", sources: [] })) });
    const res = await handleChat(body({ content: "unknown topic" }), deps);
    expect(res.status).toBe(200);
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", usage: null }));
  });

  it("404 when provided conversationId is not owned by the user", async () => {
    const deps = baseDeps({ isOwnedFn: vi.fn(async () => false) });
    const res = await handleChat(body({ content: "hi", conversationId: "other-conv" }), deps);
    expect(res.status).toBe(404);
    expect(deps.addMessageFn).not.toHaveBeenCalled();
    expect(deps.streamTextFn).not.toHaveBeenCalled();
  });

  it("reuses owned conversationId without creating a new conversation", async () => {
    const deps = baseDeps({ isOwnedFn: vi.fn(async () => true) });
    const res = await handleChat(body({ content: "hi", conversationId: "existing-conv" }), deps);
    expect(res.status).toBe(200);
    expect(deps.createConversationFn).not.toHaveBeenCalled();
    expect(res.headers.get("X-Conversation-Id")).toBe("existing-conv");
  });
});
