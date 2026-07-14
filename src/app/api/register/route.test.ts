import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/users", () => ({
  createUser: vi.fn(),
  DuplicateEmailError: class DuplicateEmailError extends Error {},
}));

import { POST } from "@/app/api/register/route";
import { createUser, DuplicateEmailError } from "@/lib/auth/users";

const req = (body: unknown) =>
  new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/register", () => {
  it("400 on invalid body", async () => {
    const res = await POST(req({ email: "nope", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("201 and returns the created user", async () => {
    vi.mocked(createUser).mockResolvedValue({ id: "u1", email: "a@b.com", role: "user" });
    const res = await POST(req({ email: "a@b.com", password: "secret12" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "u1", email: "a@b.com", role: "user" });
    expect(createUser).toHaveBeenCalledWith({ email: "a@b.com", password: "secret12", role: "user" });
  });

  it("409 on duplicate email", async () => {
    vi.mocked(createUser).mockRejectedValue(new DuplicateEmailError("a@b.com"));
    const res = await POST(req({ email: "a@b.com", password: "secret12" }));
    expect(res.status).toBe(409);
  });
});
