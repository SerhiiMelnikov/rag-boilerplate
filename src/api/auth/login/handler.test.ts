import { describe, it, expect, vi } from "vitest";
import { loginResponse } from "./handler";
import { getSessionFromRequest } from "@/lib/auth/session";

function body(b: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });
}

describe("loginResponse", () => {
  it("returns a bearer token for valid credentials", async () => {
    const authorize = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));
    const res = await loginResponse(body({ email: "a@b.com", password: "pw" }), { authorize });
    expect(res.status).toBe(200);
    const { token } = await res.json();
    const s = await getSessionFromRequest(new Request("http://localhost/x", { headers: { authorization: `Bearer ${token}` } }));
    expect(s?.id).toBe("u1");
  });

  it("401 on bad credentials", async () => {
    const res = await loginResponse(body({ email: "a@b.com", password: "wrong" }), { authorize: vi.fn(async () => null) });
    expect(res.status).toBe(401);
  });

  it("400 when email or password is missing", async () => {
    const res = await loginResponse(body({ email: "a@b.com" }), { authorize: vi.fn() });
    expect(res.status).toBe(400);
  });

  it("400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await loginResponse(req, { authorize: vi.fn() });
    expect(res.status).toBe(400);
  });

  it("calls authorize with the parsed email and password", async () => {
    const authorize = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));
    await loginResponse(body({ email: "a@b.com", password: "pw" }), { authorize });
    expect(authorize).toHaveBeenCalledWith("a@b.com", "pw");
  });
});
