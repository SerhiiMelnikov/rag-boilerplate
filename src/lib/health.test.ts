import { describe, it, expect } from "vitest";
import { ping } from "@/lib/health";

describe("health", () => {
  it("responds with pong", () => {
    expect(ping()).toBe("pong");
  });
});
