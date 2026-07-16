// Is this address at one of the allowed domains?
//
// Exact match only. A suffix check would accept `evil-company.com` for
// `company.com`, and a subdomain check would accept `sub.company.com` — both hand
// the attacker a domain they can register. If subdomains are ever wanted, list them
// explicitly.
//
// An empty list denies everyone. That is the safe reading: treating empty as
// "allow all" would make a fresh install silently accept the whole internet.
export function isEmailDomainAllowed(email: string, allowedCsv: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;

  const allowed = allowedCsv
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  return allowed.includes(domain);
}
