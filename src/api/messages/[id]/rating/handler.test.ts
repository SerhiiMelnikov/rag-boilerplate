import { describe, it, expect, vi } from "vitest";
import { rateMessageResponse } from "./handler";
import { UnauthorizedError } from "@/lib/auth/guards";

const user = vi.fn(async () => ({ id: "u1", role: "user", isSuperAdmin: false }));
const req = (b: unknown) => new Request("http://localhost/api/messages/m1/rating", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
});

describe("rateMessageResponse", () => {
  it("401s an anonymous caller", async () => {
    const setRatingFn = vi.fn();
    const res = await rateMessageResponse("m1", req({ rating: 1 }), {
      getUser: (async () => { throw new UnauthorizedError(); }) as never,
      setRatingFn: setRatingFn as never,
    });
    expect(res.status).toBe(401);
    expect(setRatingFn).not.toHaveBeenCalled();
  });

  it("400 on invalid rating value", async () => {
    const res = await rateMessageResponse("m1", req({ rating: 5 }), { getUser: user as never });
    expect(res.status).toBe(400);
  });

  it("400 on invalid JSON", async () => {
    const badReq = new Request("http://localhost/api/messages/m1/rating", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    const res = await rateMessageResponse("m1", badReq, { getUser: user as never });
    expect(res.status).toBe(400);
  });

  it("200 when the owned message is rated", async () => {
    const setRatingFn = vi.fn(async () => true);
    const res = await rateMessageResponse("m1", req({ rating: 1 }), { getUser: user as never, setRatingFn: setRatingFn as never });
    expect(res.status).toBe(200);
    expect(setRatingFn).toHaveBeenCalledWith("u1", "m1", 1);
  });

  it("404 when not owned", async () => {
    const setRatingFn = vi.fn(async () => false);
    const res = await rateMessageResponse("m1", req({ rating: -1 }), { getUser: user as never, setRatingFn: setRatingFn as never });
    expect(res.status).toBe(404);
  });

  it("accepts a null rating (clearing it)", async () => {
    const setRatingFn = vi.fn(async () => true);
    const res = await rateMessageResponse("m1", req({ rating: null }), { getUser: user as never, setRatingFn: setRatingFn as never });
    expect(res.status).toBe(200);
    expect(setRatingFn).toHaveBeenCalledWith("u1", "m1", null);
  });
});
