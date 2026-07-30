import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { oauthExchange } from "./handler";
import type { getAuthUserById } from "@/lib/auth/users";

const req = (body: unknown) =>
  new Request("http://api.test/api/auth/oauth/exchange", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

function deps(userId: string | null) {
  return {
    consumeCodeFn: vi.fn(async () => userId),
    getAuthUserFn: vi.fn(async () => ({ id: "u1", role: "admin" as const, isSuperAdmin: true, blockedAt: null, sessionsValidFrom: null })),
    encodeTokenFn: vi.fn(async () => "bearer-token"),
    pruneFn: vi.fn(async () => {}),
  };
}

const saved = { url: process.env.OAUTH_SUCCESS_URL };
beforeEach(() => { process.env.OAUTH_SUCCESS_URL = "https://consumer.app/signed-in"; });
afterEach(() => {
  if (saved.url === undefined) delete process.env.OAUTH_SUCCESS_URL;
  else process.env.OAUTH_SUCCESS_URL = saved.url;
});

describe("oauthExchange", () => {
  it("trades a live code for a bearer token carrying the user's real role", async () => {
    const d = deps("u1");
    const res = await oauthExchange(req({ code: "c" }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "bearer-token" });
    expect(d.encodeTokenFn).toHaveBeenCalledWith({ id: "u1", role: "admin", isSuperAdmin: true });
  });

  // Unknown, expired and already-used are one outcome by construction:
  // consumeHandoffCode returns a bare null. The handler must not reintroduce a
  // distinction of its own.
  it("gives one answer for every bad code", async () => {
    const res = await oauthExchange(req({ code: "c" }), deps(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid or expired code" });
  });

  it("rejects a malformed body without consuming anything", async () => {
    const d = deps("u1");
    const res = await oauthExchange(
      new Request("http://api.test/api/auth/oauth/exchange", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
      }), d);
    expect(res.status).toBe(400);
    expect(d.consumeCodeFn).not.toHaveBeenCalled();
  });

  it("is absent when no consumer is configured", async () => {
    delete process.env.OAUTH_SUCCESS_URL;
    expect((await oauthExchange(req({ code: "c" }), deps("u1"))).status).toBe(404);
  });

  // A user blocked between the redirect and the exchange must not get a token.
  it("refuses a code whose user has since been blocked or deleted", async () => {
    // Cast through unknown: getAuthUserById's inferred return type doesn't
    // spell out the null branch, same reason guards.test.ts casts its
    // null-returning getAuthUser fixtures the same way.
    const d = { ...deps("u1"), getAuthUserFn: vi.fn(async () => null) as unknown as typeof getAuthUserById };
    expect((await oauthExchange(req({ code: "c" }), d)).status).toBe(400);
    expect(d.encodeTokenFn).not.toHaveBeenCalled();
  });

  it("sweeps expired codes without blocking the response", async () => {
    const d = deps("u1");
    await oauthExchange(req({ code: "c" }), d);
    expect(d.pruneFn).toHaveBeenCalled();
  });
});
