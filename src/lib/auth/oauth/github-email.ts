// GitHub's own Auth.js provider gives NO verification guarantee, which makes it
// unsafe to combine with linking-by-email. Reading
// node_modules/@auth/core/providers/github.js:80-108:
//   - it fetches /user/emails ONLY when the profile has no public email, so a
//     user with one skips the check entirely;
//   - and when it does fetch, it picks `emails.find(e => e.primary) ?? emails[0]`,
//     ignoring `verified` and falling back to an arbitrary row.
// An attacker who gets an unverified address onto their GitHub account would
// therefore inherit whatever account this app holds for it. This module replaces
// that selection: /user/emails is always fetched, and only a primary AND
// verified address is ever returned.
const GITHUB_API_BASE_URL = "https://api.github.com";

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

function isGitHubEmail(row: unknown): row is GitHubEmail {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.email === "string" && typeof r.primary === "boolean" && typeof r.verified === "boolean";
}

// Both conditions are load-bearing. `verified` is the anti-takeover check.
// `primary` is what stops a user with several verified addresses from choosing
// which existing account to land in.
export function verifiedPrimaryEmail(rows: unknown): string | null {
  if (!Array.isArray(rows)) return null;
  const hit = rows.filter(isGitHubEmail).find((e) => e.primary && e.verified);
  return hit ? hit.email : null;
}

export async function fetchVerifiedPrimaryEmail(
  accessToken: string,
  deps: { fetchFn?: typeof fetch; apiBaseUrl?: string } = {},
): Promise<string | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  const base = deps.apiBaseUrl ?? GITHUB_API_BASE_URL;
  try {
    const res = await fetchFn(`${base}/user/emails`, {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "rag-boilerplate" },
    });
    if (!res.ok) return null;
    return verifiedPrimaryEmail(await res.json());
  } catch {
    // A network failure or an unparseable body is indistinguishable from "we
    // could not establish verification", and both must refuse rather than fall
    // back to a weaker source.
    return null;
  }
}
