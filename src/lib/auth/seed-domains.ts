// The domain part of an address, lowercased. Used by seed:admin to seed the
// registration allowlist from ADMIN_EMAIL.
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase() || null;
}
