// Name of the cookie the chat header sets to remember the active workspace.
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

// Read the active-workspace id out of a raw Cookie string. Returns undefined when
// absent or undecodable — the value is a preference, never trusted: the server
// re-validates it against the user's visible workspaces on every request.
// Shared by the server (Request header) and the browser (document.cookie).
export function readActiveWorkspaceFromCookieString(cookieString: string | null): string | undefined {
  if (!cookieString) return undefined;
  for (const part of cookieString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === ACTIVE_WORKSPACE_COOKIE) {
      const raw = part.slice(eq + 1).trim();
      try {
        const value = decodeURIComponent(raw);
        return value || undefined;
      } catch {
        // Malformed percent-encoding is attacker-controlled input; never throw.
        return undefined;
      }
    }
  }
  return undefined;
}

export function parseActiveWorkspaceCookie(request: Request): string | undefined {
  return readActiveWorkspaceFromCookieString(request.headers.get("cookie"));
}
