import { describe, it, expect, vi } from "vitest";
import { getUsageResponse } from "./handler";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/guards";

const admin = vi.fn(async () => ({ id: "a1", role: "admin" as const, isSuperAdmin: false }));
const req = () => new Request("http://x/api/admin/usage");

const summary = { promptTokens: 100, completionTokens: 50, totalTokens: 150, answers: 10 };
const byUser = [{ id: "u1", label: "a@b.com", promptTokens: 100, completionTokens: 50, totalTokens: 150, answers: 10 }];
const byWorkspace = [{ id: null, label: "Unassigned", promptTokens: 100, completionTokens: 50, totalTokens: 150, answers: 10 }];
const trend = [{ day: "2026-07-01", promptTokens: 100, completionTokens: 50, totalTokens: 150 }];

describe("getUsageResponse", () => {
  it("200s with all four aggregates present and passed through unchanged", async () => {
    const summaryFn = vi.fn(async () => summary);
    const byUserFn = vi.fn(async () => byUser);
    const byWorkspaceFn = vi.fn(async () => byWorkspace);
    const trendFn = vi.fn(async () => trend);

    const res = await getUsageResponse(req(), {
      getAdmin: admin as never,
      summaryFn,
      byUserFn,
      byWorkspaceFn,
      trendFn,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary, byUser, byWorkspace, trend });
  });

  it("403s a forbidden (non-admin) caller and does not touch any aggregate", async () => {
    const forbidden = vi.fn(async () => { throw new ForbiddenError(); });
    const summaryFn = vi.fn(async () => summary);
    const byUserFn = vi.fn(async () => byUser);
    const byWorkspaceFn = vi.fn(async () => byWorkspace);
    const trendFn = vi.fn(async () => trend);

    const res = await getUsageResponse(req(), {
      getAdmin: forbidden as never,
      summaryFn,
      byUserFn,
      byWorkspaceFn,
      trendFn,
    });

    expect(res.status).toBe(403);
    expect(summaryFn).not.toHaveBeenCalled();
    expect(byUserFn).not.toHaveBeenCalled();
    expect(byWorkspaceFn).not.toHaveBeenCalled();
    expect(trendFn).not.toHaveBeenCalled();
  });

  it("401s an unauthenticated caller rather than 500ing", async () => {
    const unauthorized = vi.fn(async () => { throw new UnauthorizedError(); });
    const res = await getUsageResponse(req(), { getAdmin: unauthorized as never });
    expect(res.status).toBe(401);
  });
});
