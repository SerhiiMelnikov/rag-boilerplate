import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/openapi.json", () => {
  it("returns the OpenAPI document", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });
});
