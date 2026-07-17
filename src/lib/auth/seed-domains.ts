// The domain part of an address, lowercased. Used by seed:admin to seed the
// registration allowlist from ADMIN_EMAIL.
//
// Strips exactly one trailing dot: "company.com." is valid FQDN root notation for
// "company.com" (an easy copy/paste artifact), and seeding the allowlist with the
// dotted form would silently reject every real registration from the same domain
// forever. A double trailing dot is not root notation, just malformed input, so it
// is left as-is and stays non-matching downstream (see isEmailDomainAllowed).
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  let domain = email.slice(at + 1).trim().toLowerCase();
  if (domain.endsWith(".") && !domain.endsWith("..")) domain = domain.slice(0, -1);
  return domain || null;
}
