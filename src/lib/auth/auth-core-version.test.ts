import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

// getSessionFromRequest decodes the session cookie with OUR @auth/core; NextAuth
// encodes it with the copy IT resolves. If the two ever differ, cookie decode can
// break silently — no compile error, and our round-trip tests wouldn't catch it
// because they encode and decode within a single version. This test is the guard.
describe("@auth/core version alignment", () => {
  it("our pinned @auth/core matches the version next-auth declares", () => {
    const ours = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const pinned = ours.dependencies["@auth/core"];
    // next-auth exposes its package.json via exports (@auth/core does not).
    const theirs = require_("next-auth/package.json").dependencies["@auth/core"];
    expect(pinned).toBe(theirs);
  });

  it("resolves to a single hoisted @auth/core (no nested copy under next-auth)", () => {
    const nested = join(process.cwd(), "node_modules/next-auth/node_modules/@auth/core");
    expect(existsSync(nested)).toBe(false);
  });
});
