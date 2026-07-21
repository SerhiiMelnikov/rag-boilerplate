import { describe, it, expect } from "vitest";
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
});
