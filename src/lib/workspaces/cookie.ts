// Name of the cookie the chat header sets to remember the active workspace.
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

// Read the active-workspace id from a request's Cookie header. Returns undefined
// when absent — callers pass that to resolveActiveWorkspaceId, which falls back
// to General. The value is always re-validated server-side; it is never trusted.
export function parseActiveWorkspaceCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === ACTIVE_WORKSPACE_COOKIE) {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return value || undefined;
    }
  }
  return undefined;
}
