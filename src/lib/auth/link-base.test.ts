import { describe, it, expect, afterEach } from "vitest";
import { resolveAuthBase, resolveLinkBase, buildLink, UntrustedAuthOriginError } from "./link-base";

const req = (url = "http://request-host.test/api/register") => new Request(url, { method: "POST" });

const saved = { AUTH_URL: process.env.AUTH_URL, NODE_ENV: process.env.NODE_ENV };
afterEach(() => {
  process.env.AUTH_URL = saved.AUTH_URL;
  // NODE_ENV is readonly in the Node types but writable at runtime; tests must
  // restore it or they leak into every later file in the same worker.
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.NODE_ENV;
});

describe("resolveAuthBase", () => {
  it("prefers AUTH_URL", () => {
    process.env.AUTH_URL = "https://configured.example";
    expect(resolveAuthBase(req())).toBe("https://configured.example");
  });

  it("falls back to the request origin outside production", () => {
    delete process.env.AUTH_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect(resolveAuthBase(req())).toBe("http://request-host.test");
  });

  // A proxy that forwards the client's Host verbatim would otherwise let an
  // attacker mint a link pointing at their own server and capture the token.
  it("refuses to trust the request's Host in production", () => {
    delete process.env.AUTH_URL;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(() => resolveAuthBase(req())).toThrow(UntrustedAuthOriginError);
  });
});

describe("resolveLinkBase / buildLink", () => {
  it("uses the external URL as a complete target, appending only the token", () => {
    process.env.AUTH_URL = "https://our-app.example";
    const base = resolveLinkBase(req(), "https://consumer.app/reset");
    expect(base).toEqual({ kind: "external", url: "https://consumer.app/reset" });
    expect(buildLink(base, "/reset", "tok+1")).toBe("https://consumer.app/reset?token=tok%2B1");
  });

  it("appends the app path to AUTH_URL when no external URL is set", () => {
    process.env.AUTH_URL = "https://our-app.example";
    const base = resolveLinkBase(req(), undefined);
    expect(buildLink(base, "/reset", "tok")).toBe("https://our-app.example/reset?token=tok");
  });

  it("normalises a trailing slash on either base", () => {
    process.env.AUTH_URL = "https://our-app.example/";
    expect(buildLink(resolveLinkBase(req(), undefined), "/verify", "t")).toBe("https://our-app.example/verify?token=t");
    expect(buildLink(resolveLinkBase(req(), "https://consumer.app/verify/"), "/verify", "t"))
      .toBe("https://consumer.app/verify?token=t");
  });
});
