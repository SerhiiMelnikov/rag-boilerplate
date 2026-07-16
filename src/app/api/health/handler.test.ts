import { describe, it, expect, vi } from "vitest";
import { healthCheck } from "./handler";

describe("healthCheck", () => {
  it("returns 200 when the database answers", async () => {
    const res = await healthCheck({ pingDb: vi.fn(async () => undefined) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 503 when the database is unreachable", async () => {
    const res = await healthCheck({
      pingDb: vi.fn(async () => { throw new Error("connection refused"); }),
    });
    expect(res.status).toBe(503);
  });

  // The endpoint is PUBLIC (no session required — a container healthcheck has no
  // credentials). A postgres-js error message can carry the connection string,
  // password included, so the body must never echo the underlying error.
  it("never leaks the database error to the caller", async () => {
    const secret = "postgres://rag:hunter2@db:5432/rag";
    const res = await healthCheck({
      pingDb: vi.fn(async () => { throw new Error(`failed to connect: ${secret}`); }),
    });
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain(secret);
  });
});
