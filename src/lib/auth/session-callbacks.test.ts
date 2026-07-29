import { describe, it, expect, vi, afterEach } from "vitest";
import { applySessionClaims, jwtCallback } from "./session-callbacks";

const signInUser = { id: "u1", role: "admin" as const, isSuperAdmin: true };

describe("jwtCallback", () => {
  afterEach(() => vi.useRealTimers());

  it("stamps identity and sessionIssuedAt at sign-in", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    vi.setSystemTime(nowMs);
    const token = jwtCallback({ token: {}, user: signInUser });
    expect(token.id).toBe("u1");
    expect(token.role).toBe("admin");
    expect(token.isSuperAdmin).toBe(true);
    expect(token.sessionIssuedAt).toBe(Math.floor(nowMs / 1000));
  });

  // The load-bearing half, inherited from 0.5.7: @auth/core calls this again on
  // every session read WITHOUT a `user`, then re-signs — which rewrites the
  // registered `iat`. sessionIssuedAt must not move with it, or a stolen cookie
  // can be renewed past its owner's password-change cut-off forever.
  it("leaves sessionIssuedAt untouched when refreshed without a user", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const signInMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    vi.setSystemTime(signInMs);
    const original = jwtCallback({ token: {}, user: signInUser });
    vi.setSystemTime(signInMs + 24 * 3600_000);
    const refreshed = jwtCallback({ token: { ...original } });
    expect(refreshed.sessionIssuedAt).toBe(original.sessionIssuedAt);
  });

  it("defaults isSuperAdmin to false when the user omits it", () => {
    const token = jwtCallback({ token: {}, user: { id: "u2", role: "user" } });
    expect(token.isSuperAdmin).toBe(false);
  });
});

describe("applySessionClaims", () => {
  it("copies the claims onto session.user", () => {
    const session = { user: { email: "a@b.test" } };
    applySessionClaims(session, { id: "u1", role: "admin", isSuperAdmin: true });
    expect(session.user).toMatchObject({ id: "u1", role: "admin", isSuperAdmin: true, email: "a@b.test" });
  });

  it("leaves a session with no user alone", () => {
    const session: { user?: Record<string, unknown> } = {};
    applySessionClaims(session, { id: "u1" });
    expect(session.user).toBeUndefined();
  });
});
