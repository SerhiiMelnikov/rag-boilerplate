import { describe, it, expect } from "vitest";
import { encode } from "@auth/core/jwt";
import { getSessionFromRequest, encodeSessionToken } from "./session";

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

describe("getSessionFromRequest issuedAt", () => {
  it("surfaces the token's iat so the cut-off check can place it in time", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await encodeSessionToken(user);
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${token}` }));
    expect(s?.issuedAt).not.toBeNull();
    expect(s!.issuedAt!).toBeGreaterThanOrEqual(before);
    // Whole seconds — this is exactly why the guard compares against a floored
    // cut-off rather than a millisecond one.
    expect(Number.isInteger(s!.issuedAt)).toBe(true);
  });
});
