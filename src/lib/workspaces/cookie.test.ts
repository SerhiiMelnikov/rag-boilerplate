import { describe, it, expect } from "vitest";
import { parseActiveWorkspaceCookie, ACTIVE_WORKSPACE_COOKIE } from "./cookie";

function req(cookie?: string): Request {
  return new Request("http://x/api/chat", { headers: cookie ? { cookie } : {} });
}

describe("parseActiveWorkspaceCookie", () => {
  it("reads the active_workspace value", () => {
    expect(parseActiveWorkspaceCookie(req(`${ACTIVE_WORKSPACE_COOKIE}=ws-42`))).toBe("ws-42");
  });
  it("finds it among other cookies and url-decodes", () => {
    expect(parseActiveWorkspaceCookie(req(`theme=dark; ${ACTIVE_WORKSPACE_COOKIE}=ws%2D9; x=1`))).toBe("ws-9");
  });
  it("returns undefined when absent or headerless", () => {
    expect(parseActiveWorkspaceCookie(req("theme=dark"))).toBeUndefined();
    expect(parseActiveWorkspaceCookie(req())).toBeUndefined();
  });
  it("returns undefined for a malformed percent-encoded value (never throws)", () => {
    expect(parseActiveWorkspaceCookie(req(`${ACTIVE_WORKSPACE_COOKIE}=%`))).toBeUndefined();
    expect(parseActiveWorkspaceCookie(req(`${ACTIVE_WORKSPACE_COOKIE}=%E0%A4%A`))).toBeUndefined();
  });
});
