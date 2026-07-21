import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireSession } from "./middleware";
import { encodeSessionToken } from "@/lib/auth/session";

describe("requireSession", () => {
  it("401s when there is no session", async () => {
    const app = new Hono().get("/protected", requireSession, (c) => c.json({ ok: true }));
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("calls next() when a valid bearer token is present", async () => {
    const app = new Hono().get("/protected", requireSession, (c) => c.json({ ok: true }));
    const token = await encodeSessionToken({ id: "u1", role: "user", isSuperAdmin: false });
    const res = await app.request("/protected", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
