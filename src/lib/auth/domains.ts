// Is this address at one of the allowed domains?
//
// Exact match only. A suffix check would accept `evil-company.com` for
// `company.com`, and a subdomain check would accept `sub.company.com` — both hand
// the attacker a domain they can register. If subdomains are ever wanted, list them
// explicitly.
//
// An empty list denies everyone. That is the safe reading: treating empty as
// "allow all" would make a fresh install silently accept the whole internet.
//
// This must hold as a security boundary on its own, not merely because today's
// caller happens to validate the address with a real email parser first. So beyond
// the domain match: reject a local part (before the last "@") that itself contains
// an "@" or whitespace, and reject a domain containing whitespace. Without this,
// `lastIndexOf("@")` plus `trim()` can be tricked into approving an address that
// isn't what it looks like — e.g. "a@b@company.com" (ambiguous split) or
// "a@ company.com" (whitespace trimmed away before the compare).
//
// A single trailing dot on either side is normalised away: "company.com." is the
// same domain as "company.com" in DNS (the dot marks the root), and an admin who
// pastes the dotted form into the allowlist — or whose address happens to carry
// one — must not be silently denied. A double trailing dot is not root notation,
// just malformed, and is left alone so it still fails to match.
function stripRootDot(domain: string): string {
  return domain.endsWith(".") && !domain.endsWith("..") ? domain.slice(0, -1) : domain;
}

export function isEmailDomainAllowed(email: string, allowedCsv: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;

  const local = email.slice(0, at);
  if (local.includes("@") || /\s/.test(local)) return false;

  const rawDomain = email.slice(at + 1);
  if (/\s/.test(rawDomain)) return false;
  const domain = stripRootDot(rawDomain.toLowerCase());
  if (!domain) return false;

  const allowed = allowedCsv
    .split(",")
    .map((d) => stripRootDot(d.trim().toLowerCase().replace(/^@/, "")))
    .filter(Boolean);

  return allowed.includes(domain);
}
