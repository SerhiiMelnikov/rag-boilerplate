import { describe, it, expect, vi } from "vitest";
import { registerUser } from "./handler";
import { DuplicateEmailError } from "@/lib/auth/users";

function baseDeps() {
  return {
    createUserFn: vi.fn(async () => ({ id: "u1", email: "a@b.co", role: "user" as const })),
  };
}

function req(body: unknown) {
  return new Request("http://test/api/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// NOTE: the installed zod (^3.25.76) rejects "a@b.c" as an invalid email (its TLD
// must be at least 2 characters), so a valid-looking single-letter TLD is used here
// instead of the shorter form seen in some drafts of this fixture.
const GOOD = { email: "a@b.co", password: "password123" };

describe("registerUser", () => {
  it("creates the user", async () => {
    const deps = baseDeps();
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(201);
    expect(deps.createUserFn).toHaveBeenCalled();
  });

  it("still rejects invalid input with 400", async () => {
    const res = await registerUser(req({ email: "nope", password: "x" }), baseDeps());
    expect(res.status).toBe(400);
  });

  it("still reports a duplicate email as 409", async () => {
    const deps = baseDeps();
    deps.createUserFn = vi.fn(async () => { throw new DuplicateEmailError("taken"); });
    const res = await registerUser(req(GOOD), deps);
    expect(res.status).toBe(409);
  });
});
