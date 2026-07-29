import { describe, it, expect, vi, afterEach } from "vitest";
import { authConfig } from "./auth.config";

// The full-app sign-in path. encodeSessionToken (covered in
// lib/auth/session.test.ts) mints tokens for api-only logins and for the token
// handed back by the change-password endpoint, but a browser session's claims
// come from THIS callback, and it is the path the session-laundering defect
// actually lived on. Without these assertions, moving the sessionIssuedAt line
// out of `if (user)` would reopen the hole with the whole suite still green.
const jwtCallback = authConfig.callbacks.jwt;
type JwtArgs = Parameters<typeof jwtCallback>[0];

const call = (args: unknown) => jwtCallback(args as JwtArgs) as unknown as Record<string, unknown>;

const signInUser = { id: "u1", role: "admin" as const, isSuperAdmin: true };

describe("auth.config jwt callback", () => {
  afterEach(() => vi.useRealTimers());

  it("stamps identity and sessionIssuedAt at sign-in", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    vi.setSystemTime(nowMs);

    const token = call({ token: {}, user: signInUser });

    expect(token.id).toBe("u1");
    expect(token.role).toBe("admin");
    expect(token.isSuperAdmin).toBe(true);
    // Whole seconds, matching the floored cut-off comparison in requireUser.
    expect(token.sessionIssuedAt).toBe(Math.floor(nowMs / 1000));
  });

  // The load-bearing half. @auth/core calls this callback again on every session
  // read, WITHOUT a `user` (lib/actions/session.js passes only token/trigger/
  // session), and then re-signs the result — which rewrites the registered `iat`
  // to "now". sessionIssuedAt must NOT be refreshed alongside it, or the cut-off
  // becomes trivially bypassable by anyone holding a stolen cookie.
  it("leaves sessionIssuedAt untouched when refreshed without a user", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const signInMs = Date.UTC(2026, 0, 1, 12, 0, 0);
    vi.setSystemTime(signInMs);
    const original = call({ token: {}, user: signInUser });

    // A day later the session is read again; Auth.js passes no `user`.
    vi.setSystemTime(signInMs + 24 * 3600_000);
    const refreshed = call({ token: { ...original } });

    expect(refreshed.sessionIssuedAt).toBe(original.sessionIssuedAt);
    expect(refreshed.sessionIssuedAt).toBe(Math.floor(signInMs / 1000));
  });

  it("exposes the token's claims on the session", () => {
    const sessionCallback = authConfig.callbacks.session;
    const session = sessionCallback({
      session: { user: {} },
      token: { id: "u1", role: "admin", isSuperAdmin: true },
    } as unknown as Parameters<typeof sessionCallback>[0]) as unknown as {
      user: { id: string; role: string; isSuperAdmin: boolean };
    };
    expect(session.user).toMatchObject({ id: "u1", role: "admin", isSuperAdmin: true });
  });
});
