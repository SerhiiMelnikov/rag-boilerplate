import { describe, it, expect, vi } from "vitest";
import { verifyEmail } from "./handler";

const req = (qs: string) => new Request(`http://test/api/auth/verify${qs}`);

describe("verifyEmail", () => {
  it("redirects to login with a success marker on a good token", async () => {
    const res = await verifyEmail(req("?token=tok"), { consumeFn: vi.fn(async () => true) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?verified=1");
  });

  it("redirects to login with an error on a bad token", async () => {
    const res = await verifyEmail(req("?token=nope"), { consumeFn: vi.fn(async () => false) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=invalid_token");
  });

  it("redirects with an error when no token is given", async () => {
    const consumeFn = vi.fn(async () => true);
    const res = await verifyEmail(req(""), { consumeFn });
    expect(res.headers.get("location")).toContain("error=invalid_token");
    expect(consumeFn).not.toHaveBeenCalled();
  });

  // Unknown, expired and already-used must be indistinguishable: telling them apart
  // tells a guesser which guesses are close.
  it("gives the same answer for every kind of bad token", async () => {
    const a = await verifyEmail(req("?token=unknown"), { consumeFn: vi.fn(async () => false) });
    const b = await verifyEmail(req("?token=expired"), { consumeFn: vi.fn(async () => false) });
    expect(a.headers.get("location")).toBe(b.headers.get("location"));
  });
});
