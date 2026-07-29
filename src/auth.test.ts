import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The composition hazard this task exists to prevent — a spread that
// overwrites `callbacks` wholesale, or a substitution that drops the
// credentials provider — lives entirely in THIS file (src/auth.ts). Nothing
// else in the suite imports "@/auth", so src/lib/auth/oauth/config.test.ts
// exercising oauthConfig() in isolation cannot catch a regression introduced
// here, e.g. a future edit reordering the spread or overriding `callbacks` a
// second time. Mocking next-auth's default export lets us capture the exact
// config object NextAuth() is called with and assert on it directly, the same
// way config.test.ts mocks "./signin" to assert on oauthSignIn's call.
let capturedConfig: Record<string, unknown> | undefined;
vi.mock("next-auth", () => ({
  default: vi.fn((config: Record<string, unknown>) => {
    capturedConfig = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  }),
}));

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) { saved[v] = process.env[v]; delete process.env[v]; }
  capturedConfig = undefined;
  // src/auth.ts computes its config at module load time, so each test needs
  // a fresh evaluation to see its own env vars — the module cache would
  // otherwise hand back the first test's already-built config.
  vi.resetModules();
});

afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("src/auth.ts composition", () => {
  it("passes NextAuth all four callbacks and the pinned basePath", async () => {
    await import("./auth");
    const cb = capturedConfig?.callbacks as Record<string, unknown>;
    for (const key of ["jwt", "session", "signIn", "redirect"]) {
      expect(typeof cb[key], key).toBe("function");
    }
    expect(capturedConfig?.basePath).toBe("/api/auth");
  });

  it("includes the credentials provider alone when no OAuth provider is configured", async () => {
    await import("./auth");
    expect(capturedConfig?.providers).toHaveLength(1);
  });

  it("adds an OAuth provider without losing the credentials one", async () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    await import("./auth");
    expect(capturedConfig?.providers).toHaveLength(2);
  });
});
