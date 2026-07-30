import { describe, it, expect, vi } from "vitest";
import { verifiedPrimaryEmail, fetchVerifiedPrimaryEmail } from "./github-email";

describe("verifiedPrimaryEmail", () => {
  it("takes the address that is both primary and verified", () => {
    expect(verifiedPrimaryEmail([
      { email: "old@x.test", primary: false, verified: true },
      { email: "me@x.test", primary: true, verified: true },
    ])).toBe("me@x.test");
  });

  // The whole point. An unverified primary is exactly the address an attacker
  // would add to take over someone else's account here.
  it("refuses an unverified primary", () => {
    expect(verifiedPrimaryEmail([{ email: "victim@x.test", primary: true, verified: false }])).toBeNull();
  });

  // Verified but not primary is somebody's real address, but it is not the one
  // GitHub considers theirs — and accepting any verified address would let a
  // user sign in as whichever of their addresses matches an existing account.
  it("refuses a verified non-primary", () => {
    expect(verifiedPrimaryEmail([{ email: "alt@x.test", primary: false, verified: true }])).toBeNull();
  });

  it("refuses an empty or malformed list", () => {
    expect(verifiedPrimaryEmail([])).toBeNull();
    expect(verifiedPrimaryEmail(null)).toBeNull();
    expect(verifiedPrimaryEmail({ nope: true })).toBeNull();
  });
});

describe("fetchVerifiedPrimaryEmail", () => {
  const rows = [{ email: "me@x.test", primary: true, verified: true }];
  const okFetch = () =>
    vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } }));

  it("always calls /user/emails and returns the verified primary", async () => {
    const fetchFn = okFetch();
    const email = await fetchVerifiedPrimaryEmail("tok", { fetchFn: fetchFn as unknown as typeof fetch });
    expect(email).toBe("me@x.test");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/user/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("returns null when GitHub refuses the request", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 403 }));
    expect(await fetchVerifiedPrimaryEmail("tok", { fetchFn: fetchFn as unknown as typeof fetch })).toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await fetchVerifiedPrimaryEmail("tok", { fetchFn: fetchFn as unknown as typeof fetch })).toBeNull();
  });
});
