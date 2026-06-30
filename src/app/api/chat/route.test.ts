import { describe, it, expect, vi } from "vitest";
import { handleChat } from "@/app/api/chat/handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const settings = { topK: 5, chatModel: "gemma-4-31b-it", temperature: 0.2, systemPrompt: "sp", minSimilarity: 0.3, contextTokenBudget: 3000 };

// Build a POST request body using the useChat payload shape.
const body = (b: unknown) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
});
// Convenience: build a standard useChat message list with a single user message + conversationId.
const msg = (content: string) => ({ messages: [{ role: "user", content }], conversationId: "c1" });

function baseDeps(over: Partial<any> = {}) {
  return {
    getSession: vi.fn(async () => ({ user: { id: "u1", role: "user" } })),
    // Cast to any: test fixture returns only the fields used by handler; full RuntimeSettings not needed.
    getSettingsFn: vi.fn(async () => settings) as any,
    prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "ctx", sources: [{ documentId: "d", filename: "f.md", chunkId: "c", score: 0.9 }] })),
    addMessageFn: vi.fn(async () => ({ id: "m1" })),
    isOwnedFn: vi.fn(async () => true),
    setTitleFn: vi.fn(async () => undefined),
    // Fake streamText: triggers onFinish so persistence runs, returns a data-stream-like Response.
    streamTextFn: vi.fn((args: any) => {
      args.onFinish?.({ text: "answer", usage: { promptTokens: 10, completionTokens: 3 } });
      return { toDataStreamResponse: () => new Response("stream", { status: 200 }) };
    }),
    ...over,
  };
}

describe("handleChat", () => {
  it("401 when getSession returns null", async () => {
    const deps = baseDeps({ getSession: vi.fn(async () => null) });
    const res = await handleChat(body(msg("hi")), deps);
    expect(res.status).toBe(401);
  });

  it("400 when the last message content is empty", async () => {
    const res = await handleChat(body({ messages: [{ role: "user", content: "" }], conversationId: "c1" }), baseDeps());
    expect(res.status).toBe(400);
  });

  it("404 when isOwnedFn returns false", async () => {
    const deps = baseDeps({ isOwnedFn: vi.fn(async () => false) });
    const res = await handleChat(body(msg("hi")), deps);
    expect(res.status).toBe(404);
    expect(deps.addMessageFn).not.toHaveBeenCalled();
    expect(deps.streamTextFn).not.toHaveBeenCalled();
  });

  it("happy path: persists user+assistant messages and calls streamText", async () => {
    const deps = baseDeps();
    const res = await handleChat(body(msg("why is the sky blue?")), deps);
    expect(res.status).toBe(200);
    // isOwnedFn called to verify ownership
    expect(deps.isOwnedFn).toHaveBeenCalledWith("u1", "c1");
    // title set from first user message
    expect(deps.setTitleFn).toHaveBeenCalledWith("u1", "c1", expect.any(String));
    // user message persisted first
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ conversationId: "c1", role: "user", content: "why is the sky blue?" }));
    // assistant message persisted via onFinish
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", content: "answer", usage: { promptTokens: 10, completionTokens: 3 } }));
    expect(deps.streamTextFn).toHaveBeenCalled();
  });

  it("passes prior conversation turns to the model and uses a history-aware retrieval query", async () => {
    const deps = baseDeps();
    const convo = {
      messages: [
        { role: "user", content: "Who is Broderick?" },
        { role: "assistant", content: "Broderick is a character." },
        { role: "user", content: "Who is his brother?" },
      ],
      conversationId: "c1",
    };
    await handleChat(body(convo), deps);
    const streamArg = (deps.streamTextFn as any).mock.calls[0][0];
    // Full conversation history is forwarded as messages (context memory).
    expect(streamArg.messages).toEqual([
      { role: "user", content: "Who is Broderick?" },
      { role: "assistant", content: "Broderick is a character." },
      { role: "user", content: "Who is his brother?" },
    ]);
    // Retrieval query carries the prior entity so the pronoun follow-up resolves.
    const retrievalQuery = (deps.prepareContextFn as any).mock.calls[0][0];
    expect(retrievalQuery).toContain("Broderick");
    expect(retrievalQuery).toContain("his brother");
  });

  it("no-context: does not call the model, persists fallback assistant message, returns 200", async () => {
    const deps = baseDeps({ prepareContextFn: vi.fn(async () => ({ hasContext: false, context: "", sources: [] })) });
    const res = await handleChat(body(msg("unknown topic")), deps);
    expect(res.status).toBe(200);
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    // User message persisted first, fallback assistant second with usage: null
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", usage: null }));
  });
});
