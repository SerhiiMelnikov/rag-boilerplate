import { describe, it, expect, vi } from "vitest";
import { handleChat, type ChatDeps } from "@/app/api/chat/handler";
import { MissingProviderKeyError } from "@/lib/providers/types";
import type { addMessage } from "@/lib/chat/conversations";
import type { prepareContext } from "@/lib/rag/answer";
import type { searchImages, ImageSearchHit } from "@/lib/images/search";
import type { getAuthUserById } from "@/lib/auth/users";
import type { getRuntimeSettings } from "@/lib/config/settings-service";
import type { getChatModel } from "@/lib/providers";

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

// Deliberate: three fields here (getAuthUser, getSettingsFn, getChatModelFn) are cast
// individually to their real collaborator type, because their fixtures are narrower
// than the production shape (only the fields handleChat reads). streamTextFn's `args`
// is typed `unknown` instead (see the comment on it below) rather than cast. Every
// OTHER field is left as-is, so `chat()` (the thin ChatDeps-typed wrapper following
// this function) checks it structurally against its real collaborator type — the whole
// point being that a fixture that drifts from the real shape (e.g. prepareContextFn
// returning the wrong field types) fails `tsc --noEmit`.
function baseDeps<T extends object = object>(over: T = {} as T) {
  return {
    getSession: vi.fn(async () => ({ user: { id: "u1", role: "user" } })),
    // Cast through unknown: fixture returns only the fields getAuthUserById's callers read.
    getAuthUser: vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false, blockedAt: null })) as unknown as typeof getAuthUserById,
    // Cast through unknown: fixture returns only the fields used by handler; full RuntimeSettings not needed.
    getSettingsFn: vi.fn(async () => settings) as unknown as typeof getRuntimeSettings,
    prepareContextFn: vi.fn(async (..._args: Parameters<typeof prepareContext>) => ({ hasContext: true, context: "ctx", sources: [{ documentId: "d", filename: "f.md", chunkId: "c", score: 0.9 }] })),
    getChatModelFn: vi.fn(() => ({})) as unknown as typeof getChatModel,
    addMessageFn: vi.fn(async (..._args: Parameters<typeof addMessage>) => ({ id: "m1" })),
    isOwnedFn: vi.fn(async () => true),
    setTitleFn: vi.fn(async () => undefined),
    // Fake streamText: triggers onFinish so persistence runs, returns a data-stream-like
    // Response. `args` is typed `unknown` (not a narrowed literal): a narrowed param type
    // would make this mock's signature contravariantly incompatible with StreamTextLike's
    // real (large) `Parameters<typeof streamText>[0]` type, forcing a whole-field cast that
    // erases the Mock typing `.mock.calls` below relies on. `unknown` is assignable *to*
    // from anything, so the mock stays structurally checked as `Mock<(args: unknown) => …>`
    // without any cast, and we narrow internally only where we read from it.
    streamTextFn: vi.fn((args: unknown) => {
      const { onFinish } = args as { onFinish?: (arg: { text: string; usage: { promptTokens: number; completionTokens: number } }) => void };
      onFinish?.({ text: "answer", usage: { promptTokens: 10, completionTokens: 3 } });
      return { toDataStreamResponse: () => new Response("stream", { status: 200 }) };
    }),
    // Default to the TEXT intent so existing (pre-routing) tests keep exercising the
    // document-RAG path deterministically instead of hitting the real router/model.
    routeIntentFn: vi.fn(async () => ({ kind: "text" }) as const),
    // Default verifier: vouches for every candidate, so the image tests that don't
    // care about relevance keep asserting on what searchImagesFn returned.
    verifyImageMatchesFn: vi.fn(async (_q: string, hits: ImageSearchHit[]) => hits),
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

// Thin wrapper typed directly against ChatDeps — see the comment on baseDeps for
// why only three fields are cast individually instead of casting the whole object.
function chat(request: Request, deps: ChatDeps) {
  return handleChat(request, deps);
}

describe("handleChat", () => {
  it("401 when getSession returns null", async () => {
    const deps = baseDeps({ getSession: vi.fn(async () => null) });
    const res = await chat(body(msg("hi")), deps);
    expect(res.status).toBe(401);
  });

  it("400 when the last message content is empty", async () => {
    const res = await chat(body({ messages: [{ role: "user", content: "" }], conversationId: "c1" }), baseDeps());
    expect(res.status).toBe(400);
  });

  it("404 when isOwnedFn returns false", async () => {
    const deps = baseDeps({ isOwnedFn: vi.fn(async () => false) });
    const res = await chat(body(msg("hi")), deps);
    expect(res.status).toBe(404);
    expect(deps.addMessageFn).not.toHaveBeenCalled();
    expect(deps.streamTextFn).not.toHaveBeenCalled();
  });

  it("happy path: persists user+assistant messages and calls streamText", async () => {
    const deps = baseDeps();
    const res = await chat(body(msg("why is the sky blue?")), deps);
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
    await chat(body(convo), deps);
    // Cast: streamTextFn's fixture param is typed `unknown` (see baseDeps), so its
    // captured call arg needs narrowing here to read the field this test checks.
    const streamArg = deps.streamTextFn.mock.calls[0][0] as { messages: unknown };
    // Full conversation history is forwarded as messages (context memory).
    expect(streamArg.messages).toEqual([
      { role: "user", content: "Who is Broderick?" },
      { role: "assistant", content: "Broderick is a character." },
      { role: "user", content: "Who is his brother?" },
    ]);
    // Retrieval query carries the prior entity so the pronoun follow-up resolves.
    const retrievalQuery = deps.prepareContextFn.mock.calls[0][0];
    expect(retrievalQuery).toContain("Broderick");
    expect(retrievalQuery).toContain("his brother");
  });

  it("no-context: does not call the model, persists fallback assistant message, returns 200", async () => {
    const deps = baseDeps({ prepareContextFn: vi.fn(async () => ({ hasContext: false, context: "", sources: [] })) });
    const res = await chat(body(msg("unknown topic")), deps);
    expect(res.status).toBe(200);
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    // User message persisted first, fallback assistant second with usage: null
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: "assistant", usage: null }));
  });

  it("provider key missing: streams the error as the assistant message, no model call, 200", async () => {
    const deps = baseDeps({
      getChatModelFn: vi.fn(() => { throw new MissingProviderKeyError("Chat", "openai"); }),
    });
    const res = await chat(body(msg("hi")), deps);
    expect(res.status).toBe(200);
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    // Assistant message persisted with the provider-error text + usage null.
    expect(deps.addMessageFn).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: "assistant",
      content: expect.stringMatching(/no API key for provider "openai"/),
      usage: null,
    }));
  });

  // A broken provider must not masquerade as "your question wasn't about images":
  // the router failing is an operator problem, and the user is told so.
  it("reports a provider error from the intent router instead of silently answering with text", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => { throw new MissingProviderKeyError("Chat", "openai"); }),
    });
    const res = await chat(body(msg("show me a bike")), deps);
    expect(res.status).toBe(200);
    expect(deps.prepareContextFn).not.toHaveBeenCalled();
    expect(deps.streamTextFn).not.toHaveBeenCalled();
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].content).toMatch(/no API key for provider "openai"/);
  });

  it("IMAGE intent: persists images + streams the intro, skips prepareContext", async () => {
    const prepareContextFn = vi.fn();
    const deps = baseDeps({
      prepareContextFn,
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "red bike" }) as const),
      searchImagesFn: vi.fn(async () => [{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]),
    });
    const res = await chat(body(msg("show me a red bike")), deps);
    expect(res.status).toBe(200);
    // assistant message persisted with the images
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].images).toEqual([{ imageId: "img-1", filename: "bike.png", score: 0.9 }]);
    expect(prepareContextFn).not.toHaveBeenCalled();
  });

  it("IMAGE intent with no hits: streams the not-found message", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "unicorn" }) as const),
      searchImagesFn: vi.fn(async () => []),
    });
    await chat(body(msg("show me a unicorn")), deps);
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].content).toMatch(/couldn't find/i);
    expect(assistantCall?.[0].images ?? []).toEqual([]);
  });

  it("IMAGE intent: gates candidates on its own floor, not the text minSimilarity", async () => {
    const searchImagesFn = vi.fn(async (_q: string, _opts: { topN: number; minScore: number }) => []);
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "a young man" }) as const),
      searchImagesFn,
    });
    await chat(body(msg("a young man")), deps);
    // A caption's cosine similarity to a short query never reaches the text threshold
    // (0.3 here), so reusing it would drop every image. Candidates are over-fetched
    // for the verifier, then trimmed to the display count.
    const opts = searchImagesFn.mock.calls[0][1];
    expect(opts.minScore).toBeLessThan(settings.minSimilarity);
    expect(opts.topN).toBeGreaterThan(3);
  });

  it("IMAGE intent: returns only the images the verifier vouched for", async () => {
    const hits = [
      { imageId: "img-1", filename: "man.png", caption: "a young man", score: 0.26 },
      { imageId: "img-2", filename: "ui.png", caption: "a dark user interface", score: 0.19 },
    ];
    const verifyImageMatchesFn = vi.fn(async () => [hits[0]]);
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "a young man" }) as const),
      searchImagesFn: vi.fn(async () => hits),
      verifyImageMatchesFn,
    });
    await chat(body(msg("a young man")), deps);
    expect(verifyImageMatchesFn).toHaveBeenCalledWith("a young man", hits, expect.anything());
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].images).toEqual([{ imageId: "img-1", filename: "man.png", score: 0.26 }]);
  });

  // The verifier's relevance order must survive the trim — a future refactor that
  // re-sorts by cosine score before slicing would silently drop the best matches.
  it("IMAGE intent: keeps the verifier's order when trimming to the display count", async () => {
    const hits = [
      { imageId: "i1", filename: "1.png", caption: "c1", score: 0.30 },
      { imageId: "i2", filename: "2.png", caption: "c2", score: 0.25 },
      { imageId: "i3", filename: "3.png", caption: "c3", score: 0.20 },
      { imageId: "i4", filename: "4.png", caption: "c4", score: 0.15 },
    ];
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "q" }) as const),
      searchImagesFn: vi.fn(async () => hits),
      // Deliberately NOT score order: the two weakest cosine hits are the best matches.
      verifyImageMatchesFn: vi.fn(async () => [hits[3], hits[2], hits[1], hits[0]]),
    });
    await chat(body(msg("q")), deps);
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].images?.map((i) => i.imageId)).toEqual(["i4", "i3", "i2"]);
  });

  it("IMAGE intent: reports a provider error from the verifier instead of 'not found'", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "q" }) as const),
      searchImagesFn: vi.fn(async () => [{ imageId: "i1", filename: "1.png", caption: "c1", score: 0.2 }]),
      verifyImageMatchesFn: vi.fn(async () => { throw new MissingProviderKeyError("Chat", "openai"); }),
    });
    await chat(body(msg("q")), deps);
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].content).toMatch(/no API key for provider "openai"/);
    expect(assistantCall?.[0].content).not.toMatch(/couldn't find/i);
  });

  it("IMAGE intent: says nothing was found when the verifier rejects every candidate", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "a red bicycle" }) as const),
      searchImagesFn: vi.fn(async () => [{ imageId: "img-1", filename: "man.png", caption: "a young man", score: 0.19 }]),
      verifyImageMatchesFn: vi.fn(async () => []),
    });
    await chat(body(msg("a red bicycle")), deps);
    const assistantCall = deps.addMessageFn.mock.calls.find((c) => c[0].role === "assistant");
    expect(assistantCall?.[0].content).toMatch(/couldn't find/i);
    expect(assistantCall?.[0].images ?? []).toEqual([]);
  });

  it("TEXT intent: takes the existing RAG path (prepareContext called)", async () => {
    const prepareContextFn = vi.fn(async () => ({ hasContext: false, context: "", sources: [] }));
    const deps = baseDeps({
      prepareContextFn,
      routeIntentFn: vi.fn(async () => ({ kind: "text" }) as const),
    });
    await chat(body(msg("why is the sky blue?")), deps);
    expect(prepareContextFn).toHaveBeenCalled();
  });

  it("scopes retrieval + image search to the workspace allowlist and stamps workspace_id", async () => {
    const deps = baseDeps();
    await chat(body(msg("why is the sky blue?")), deps);
    // prepareContext receives the resolved document allowlist (General → doc-1)
    const prepArgs = deps.prepareContextFn.mock.calls[0];
    expect(prepArgs[2]).toEqual({ allowedDocumentIds: ["doc-1"] });
    // every persisted message carries the active workspace id
    for (const call of deps.addMessageFn.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ workspaceId: "ws-general" }));
    }
  });

  it("passes allowedImageIds to image search on an image-intent turn", async () => {
    const deps = baseDeps({
      routeIntentFn: vi.fn(async () => ({ kind: "image", query: "red bike" })),
      searchImagesFn: vi.fn(async (..._args: Parameters<typeof searchImages>) => [{ imageId: "img-1", filename: "bike.png", caption: "a red bicycle", score: 0.9 }]),
    });
    await chat(body(msg("show me a red bike")), deps);
    const imgArgs = deps.searchImagesFn.mock.calls[0];
    expect(imgArgs[1]).toEqual(expect.objectContaining({ allowedImageIds: ["img-1"] }));
  });
});
