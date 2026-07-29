// Thrown when we cannot mint a link we would be willing to send. Callers turn it
// into a clean 503 rather than sending a link they cannot trust.
export class UntrustedAuthOriginError extends Error {
  constructor() {
    super("AUTH_URL is required in production; refusing to trust the request's Host");
    this.name = "UntrustedAuthOriginError";
  }
}

// The emailed link's base MUST NOT come from the request in production: these are
// not Auth.js routes, so AUTH_TRUST_HOST does not guard them, and a proxy that
// forwards the client's Host verbatim would let an attacker mint a link pointing
// at their own server — capturing the victim's token. Dev has no proxy and no
// attacker, so the request's origin is fine there.
export function resolveAuthBase(request: Request): string {
  const configured = process.env.AUTH_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new UntrustedAuthOriginError();
  return new URL(request.url).origin;
}

export type LinkBase = { kind: "external"; url: string } | { kind: "app"; origin: string };

// `externalUrl` (VERIFY_URL / RESET_URL) wins over AUTH_URL whenever both are
// set: AUTH_URL names this app's own origin, never a headless consumer's UI.
// Unlike AUTH_URL it needs no production guard — it is always an explicit
// operator config value, never derived from the (spoofable) request.
export function resolveLinkBase(request: Request, externalUrl: string | undefined): LinkBase {
  if (externalUrl) return { kind: "external", url: externalUrl };
  return { kind: "app", origin: resolveAuthBase(request) };
}

// In headless (api-only) mode there is no page of ours to point at — the
// consumer runs its own frontend and its env var is therefore the COMPLETE link
// target already (e.g. "https://consumer.app/reset"), not an origin to append a
// path to like AUTH_URL is. Only the token query param gets added.
export function buildLink(base: LinkBase, appPath: string, token: string): string {
  const target = base.kind === "external"
    ? base.url.replace(/\/$/, "")
    : `${base.origin.replace(/\/$/, "")}${appPath}`;
  return `${target}?token=${encodeURIComponent(token)}`;
}
