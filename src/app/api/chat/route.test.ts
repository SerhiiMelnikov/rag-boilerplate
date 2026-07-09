import { describe, it, expect, vi } from "vitest";
import { handleChat } from "@/app/api/chat/handler";
import { UnauthorizedError } from "@/lib/auth/guards";
import { MissingProviderKeyError } from "@/lib/providers/types";

const settings = {
  chatProvider: "google", chatModel: "gemma-4-31b-it",
  embeddingProvider: "google", embeddingModel: "gemini-embedding-2",
  parserProvider: "google", parserModel: "gemini-2.5-flash",
  temperature: 0.2, topK: 5, minSimilarity: 0.3, contextTokenBudget: 3000,
  systemPrompt: "sp", ollamaBaseUrl: "http://localhost:11434",
  keys: { google: "gk", openai: null, anthropic: null },
};

// Build a POST request body using the useChat payload shape.
const body = (b: unknown) => new Request("http://localhost/api/chat", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
});
// Convenience: build a standard useChat message list with a single user message + conversationId.
const msg = (content: string) => ({ messages: [{ role: "user", content }], conversationId: "c1" });

function baseDeps(over: Partial<any> = {}) {
  return {
    getSession: vi.fn(async () => ({ user: { id: "u1", role: "user" } })),
    getAuthUser: vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: null })) as any,
    // Cast to any: test fixture returns only the fields used by handler; full RuntimeSettings not needed.
    getSettingsFn: vi.fn(async () => settings) as any,
    prepareContextFn: vi.fn(async () => ({ hasContext: true, context: "ctx", sources: [{ documentId: "d", filename: "f.md", chunkId: "c", score: 0.9 }] })),
    getChatModelFn: vi.fn(() => ({})) as any,
    addMessageFn: vi.fn(async () => ({ id: "m1" })),
    isOwnedFn: vi.fn(async () => true),
    setTitleFn: vi.fn(async () => undefined),
    // Fake streamText: triggers onFinish so persistence runs, returns a data-stream-like Response.
    streamTextFn: vi.fn((args: any) => {
      args.onFinish?.({ text: "answer", usage: { promptTokens: 10, completionTokens: 3 } });
      return { toDataStreamResponse: () => new Response("stream", { status: 200 }) };
    }),
    // Default to the TEXT intent so existing (pre-routing) tests keep exercising the
    // document-RAG path deterministically instead of hitting the real router/model.
    routeIntentFn: vi.fn(async () => ({ kind: "text" }) as const),
    // Fake workspace repo: user sees only General (ws-general), which resolves to
    // doc-1/img-1 allowlists. No cookie is set in these tests, so the handler
    // always falls back to General via resolveActiveWorkspaceId.
    workspaceRepo: {
      getDefaultId: async () => "ws-general",
      listAllIds: async () => ["ws-general"],
      listGrantedIds: async () => [],
      isAdmin: async () => false,
      documentIdsIn: async () => ["doc-1"],
      imageIdsIn: async () => ["img-1"],
    },
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

  it("provider key missing: streams the error as the assistant message, no model call, 200", async () => {
    const deps = baseDeps({
      getChatModelFn: vi.fn(() => { throw new MissingProviderKeyError("Chat", "openai"); }),
    });
    const res = await handleChat(body(msg("hi")), deps);
    expect(res.status).toBe(200);
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    // Assistant message persisted with the provider-error text + usage null.
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: "assistant",
      content: expect.stringMatching(/no API key for provider "openai"/),
      usage: null,
    }));
  });

  it("IMAGE intent: persists images + streams the intro, skips prepareContext", async () => {
    const prepareContextFn = vi.fn();
    const deps = baseDeps({
      prepareContextFn,
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "red bike" }) as const),
      searchImagesFn: vi.fn(async () => [{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]),
    });
    const res = await handleChat(body(msg("show me a red bike")), deps);
    expect(res.status).toBe(200);
    // assistant message persisted with the images
    const assistantCall = (deps.addMessageFn as any).mock.calls.find((c: any) => c[0].role === "assistant");
    expect(assistantCall?.[0].images).toEqual([{ imageId: "img-1", filename: "bike.png", score: 0.9 }]);
    expect(prepareContextFn).not.toHaveBeenCalled();
  });

  it("IMAGE intent with no hits: streams the not-found message", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "unicorn" }) as const),
      searchImagesFn: vi.fn(async () => []),
    });
    await handleChat(body(msg("show me a unicorn")), deps);
    const assistantCall = (deps.addMessageFn as any).mock.calls.find((c: any) => c[0].role === "assistant");
    expect(assistantCall?.[0].content).toMatch(/couldn't find/i);
    expect(assistantCall?.[0].images ?? []).toEqual([]);
  });

  it("TEXT intent: takes the existing RAG path (prepareContext called)", async () => {
    const prepareContextFn = vi.fn(async () => ({ hasContext: false, context: "", sources: [] }));
    const deps = baseDeps({
      prepareContextFn,
      routeIntentFn: vi.fn(async () => ({ kind: "text" }) as const),
    });
    await handleChat(body(msg("why is the sky blue?")), deps);
    expect(prepareContextFn).toHaveBeenCalled();
  });

  it("scopes retrieval + image search to the workspace allowlist and stamps workspace_id", async () => {
    const deps = baseDeps();
    await handleChat(body(msg("why is the sky blue?")), deps);
    // prepareContext receives the resolved document allowlist (General → doc-1)
    const prepArgs = (deps.prepareContextFn as any).mock.calls[0];
    expect(prepArgs[2]).toEqual({ allowedDocumentIds: ["doc-1"] });
    // every persisted message carries the active workspace id
    for (const call of (deps.addMessageFn as any).mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ workspaceId: "ws-general" }));
    }
  });

  it("passes allowedImageIds to image search on an image-intent turn", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "red bike" })),
      searchImagesFn: vi.fn(async () => [{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]),
    });
    await handleChat(body(msg("show me a red bike")), deps);
    // Cast deps itself (not just the property) to any: searchImagesFn is only
    // present via the override, so it isn't part of baseDeps's inferred return type.
    const imgArgs = (deps as any).searchImagesFn.mock.calls[0];
    expect(imgArgs[1]).toEqual(expect.objectContaining({ allowedImageIds: ["img-1"] }));
  });
});
