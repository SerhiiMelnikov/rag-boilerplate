import { describe, it, expect, vi, afterEach } from "vitest";
import { encode, decode } from "@auth/core/jwt";
import { getSessionFromRequest, encodeSessionToken } from "./session";
import { requireUser, UnauthorizedError } from "./guards";
import type { getAuthUserById } from "./users";

const user = { id: "u1", role: "admin", isSuperAdmin: true };
process.env.AUTH_SECRET ??= "test-secret-stub-for-vitest-do-not-use-in-production";

function reqWith(headers: Record<string, string>) {
  return new Request("http://localhost/api/x", { headers });
}

describe("getSessionFromRequest", () => {
  it("round-trips a token via the Authorization: Bearer header", async () => {
    const token = await encodeSessionToken(user);
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${token}` }));
    expect(s).toMatchObject({ id: "u1", role: "admin", isSuperAdmin: true });
  });
  it("round-trips a token via the session cookie", async () => {
    const token = await encodeSessionToken(user);
    const s = await getSessionFromRequest(reqWith({ cookie: `authjs.session-token=${token}` }));
    expect(s?.id).toBe("u1");
  });
  it("returns null with no token", async () => {
    expect(await getSessionFromRequest(reqWith({}))).toBeNull();
  });
  it("returns null on a garbage token", async () => {
    expect(await getSessionFromRequest(reqWith({ authorization: "Bearer not-a-jwt" }))).toBeNull();
  });
  it("decodes a __Secure-salted token sent via Authorization: Bearer (regression guard)", async () => {
    // Mint a token the way NextAuth does in production, under the
    // __Secure- prefixed cookie's salt, then forward it as a bare Bearer
    // token (e.g. a non-browser client that copied it out of the cookie).
    const token = await encode({
      token: { sub: user.id, id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
      secret: process.env.AUTH_SECRET as string,
      salt: "__Secure-authjs.session-token",
    });
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${token}` }));
    expect(s).toMatchObject({ id: "u1", role: "admin", isSuperAdmin: true });
  });
});

describe("getSessionFromRequest sessionIssuedAt", () => {
  it("surfaces when the session began so the cut-off check can place it in time", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await encodeSessionToken(user);
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${token}` }));
    expect(s?.sessionIssuedAt).not.toBeNull();
    expect(s!.sessionIssuedAt!).toBeGreaterThanOrEqual(before);
    // Whole seconds — this is exactly why the guard compares against a floored
    // cut-off rather than a millisecond one.
    expect(Number.isInteger(s!.sessionIssuedAt)).toBe(true);
  });

  // A token minted before this claim existed carries no sessionIssuedAt. It must
  // read as null (NOT fall back to `iat`), because null is what makes the guard
  // refuse it once a cut-off exists — see the round-trip test below for why
  // falling back to `iat` would reopen the hole.
  it("reports null for a token minted without the claim", async () => {
    const token = await encode({
      token: { sub: user.id, id: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin },
      secret: process.env.AUTH_SECRET as string,
      salt: "authjs.session-token",
    });
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${token}` }));
    expect(s?.id).toBe("u1");
    expect(s?.sessionIssuedAt).toBeNull();
  });
});

// Regression guard for the defect this claim exists to prevent.
//
// @auth/core re-signs the session JWT on EVERY session read
// (lib/actions/session.js: "Refresh JWT expiry by re-signing it" ->
// jwt.encode({ ...jwt, token, salt })), and its encode calls jose's
// .setIssuedAt() with no argument, which overwrites `iat` with "now"
// unconditionally. In the full app that refresh is reachable by anyone holding
// the cookie: GET /api/auth/session is a plain, CSRF-free GET that answers with
// a refreshed Set-Cookie. So keying the cut-off on `iat` let a stolen cookie be
// laundered into a token that looks newer than the victim's password reset,
// forever. A CUSTOM claim survives that re-signing untouched, so we key on that.
describe("session cut-off survives an @auth/core session refresh", () => {
  afterEach(() => vi.useRealTimers());

  const SIGN_IN_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
  const salt = "authjs.session-token";

  const authUser = (sessionsValidFrom: Date | null) =>
    (async () => ({
      id: "u1", role: "user" as const, isSuperAdmin: false, blockedAt: null, sessionsValidFrom,
    })) as unknown as typeof getAuthUserById;

  it("still refuses a re-issued token whose iat was moved past the cut-off", async () => {
    // Only Date is faked: jose reads the clock via Date, and faking timers
    // wholesale would stall the async crypto these helpers await.
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(SIGN_IN_MS);
    const original = await encodeSessionToken(user);
    const originalPayload = await decode({ token: original, secret: process.env.AUTH_SECRET as string, salt });

    // The victim resets their password one minute after this session began.
    const cutoff = new Date(SIGN_IN_MS + 60_000);

    // Two minutes after sign-in the attacker replays the stolen token through
    // the session endpoint. These are verbatim the two lines @auth/core's
    // session action runs: decode, then encode the decoded payload.
    vi.setSystemTime(SIGN_IN_MS + 120_000);
    const reissued = await encode({ token: originalPayload!, secret: process.env.AUTH_SECRET as string, salt });
    const reissuedPayload = await decode({ token: reissued, secret: process.env.AUTH_SECRET as string, salt });

    // The mechanism itself: `iat` moved past the cut-off, the custom claim did not.
    expect(reissuedPayload!.iat).toBeGreaterThan(originalPayload!.iat as number);
    expect(reissuedPayload!.iat).toBeGreaterThan(Math.floor(cutoff.getTime() / 1000));
    expect(reissuedPayload!.sessionIssuedAt).toBe(originalPayload!.sessionIssuedAt);
    expect(reissuedPayload!.sessionIssuedAt).toBe(Math.floor(SIGN_IN_MS / 1000));

    // Therefore the refreshed token must STILL be refused: the session it
    // represents began before the reset, however new the wrapper looks.
    await expect(
      requireUser(reqWith({ authorization: `Bearer ${reissued}` }), { getAuthUser: authUser(cutoff) }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("still accepts a re-issued token from a session that began after the cut-off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    // Cut-off first, then the user signs in again with their new password.
    const cutoff = new Date(SIGN_IN_MS);
    vi.setSystemTime(SIGN_IN_MS + 60_000);
    const original = await encodeSessionToken(user);
    const originalPayload = await decode({ token: original, secret: process.env.AUTH_SECRET as string, salt });

    vi.setSystemTime(SIGN_IN_MS + 120_000);
    const reissued = await encode({ token: originalPayload!, secret: process.env.AUTH_SECRET as string, salt });

    await expect(
      requireUser(reqWith({ authorization: `Bearer ${reissued}` }), { getAuthUser: authUser(cutoff) }),
    ).resolves.toMatchObject({ id: "u1" });
  });
});
