function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Escaping (above) only keeps the link from breaking out of the `href` attribute;
// it says nothing about what scheme ends up inside it. Nothing calls this with an
// attacker-controlled link today, but reject anything other than http(s) so a
// future, less careful call site can't get us to render a live `javascript:` link.
function assertHttpUrl(link: string): void {
  const { protocol } = new URL(link);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`Refusing to render a non-http(s) link (scheme: ${protocol})`);
  }
}

export function verificationEmail(link: string): { subject: string; html: string } {
  assertHttpUrl(link);
  const safe = escapeHtml(link);
  return {
    subject: "Confirm your email address",
    html: `<p>Confirm your email address to finish creating your account:</p>
<p><a href="${safe}">${safe}</a></p>
<p>The link expires in 24 hours. If you did not request this, ignore this email.</p>`,
  };
}
