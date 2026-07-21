import { describe, it, expect, vi } from "vitest";
import { submitVerification } from "./handler";

const req = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return new Request("http://test/api/auth/verify", { method: "POST", body });
};

const jsonReq = (body: unknown) =>
  new Request("http://test/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function deps(consumeResult = true) {
  return {
    consumeFn: vi.fn(async () => consumeResult),
    // A stub, not real bcrypt, so the test can assert exactly what travels to
    // consumeFn without paying (or depending on) real hashing cost.
    hashPasswordFn: vi.fn(async (pw: string) => `hashed:${pw}`),
  };
}

describe("submitVerification", () => {
  it("hashes the submitted password and consumes the token with it", async () => {
    const d = deps(true);
    const res = await submitVerification(req({ token: "tok", password: "my-new-password" }), d);
    expect(d.hashPasswordFn).toHaveBeenCalledWith("my-new-password");
    expect(d.consumeFn).toHaveBeenCalledWith("tok", "hashed:my-new-password");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?verified=1");
  });

  it("sends the clicker back to the same link with an error when the token is bad", async () => {
    const d = deps(false);
    const res = await submitVerification(req({ token: "tok", password: "my-new-password" }), d);
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("/verify?token=tok");
    expect(location).toContain("error=1");
  });

  // Unknown, expired, already-used and already-verified must be indistinguishable
  // in the response: telling them apart tells a guesser which guesses are close.
  it("gives the same answer regardless of why the token was rejected", async () => {
    const d = deps(false);
    const res = await submitVerification(req({ token: "test-token", password: "my-new-password" }), d);
    const location = res.headers.get("location")!;
    const url = new URL(location, "http://test");
    // Only token and error parameters are allowed in rejection URLs. If a reason
    // or other distinguishing parameter were added, this would catch it.
    const params = Array.from(url.searchParams.keys());
    expect(params).toEqual(["token", "error"]);
  });

  it("rejects a too-short password without ever calling consumeFn — the token is untouched", async () => {
    const d = deps(true);
    const res = await submitVerification(req({ token: "tok", password: "short" }), d);
    expect(d.consumeFn).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("/verify?token=tok");
    expect(location).toContain("error=1");
  });

  it("rejects a missing token without calling consumeFn", async () => {
    const d = deps(true);
    const res = await submitVerification(req({ password: "my-new-password" }), d);
    expect(d.consumeFn).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
  });
});

// Headless consumers (a SPA/mobile app in api-only mode, not the Next `/verify`
// page) POST JSON here instead of a form. Same underlying verification, a
// different response shape: JSON in, JSON out, never a redirect.
describe("submitVerification — JSON branch (headless clients)", () => {
  it("hashes the submitted password, consumes the token, and returns { status: 'verified' } — no redirect", async () => {
    const d = deps(true);
    const res = await submitVerification(jsonReq({ token: "tok", password: "my-new-password" }), d);
    expect(d.hashPasswordFn).toHaveBeenCalledWith("my-new-password");
    expect(d.consumeFn).toHaveBeenCalledWith("tok", "hashed:my-new-password");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    await expect(res.json()).resolves.toEqual({ status: "verified" });
  });

  it("returns 400 JSON (not a redirect) when the token is unknown/expired/already-used", async () => {
    const d = deps(false);
    const res = await submitVerification(jsonReq({ token: "tok", password: "my-new-password" }), d);
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 JSON without ever calling consumeFn when the password is too short", async () => {
    const d = deps(true);
    const res = await submitVerification(jsonReq({ token: "tok", password: "short" }), d);
    expect(d.consumeFn).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it("returns 400 JSON without ever calling consumeFn when the token is missing", async () => {
    const d = deps(true);
    const res = await submitVerification(jsonReq({ password: "my-new-password" }), d);
    expect(d.consumeFn).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });

  it("returns 400 JSON when the body is not valid JSON", async () => {
    const req = new Request("http://test/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await submitVerification(req, deps(true));
    expect(res.status).toBe(400);
  });
});
