function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function verificationEmail(link: string): { subject: string; html: string } {
  const safe = escapeHtml(link);
  return {
    subject: "Confirm your email address",
    html: `<p>Confirm your email address to finish creating your account:</p>
<p><a href="${safe}">${safe}</a></p>
<p>The link expires in 24 hours. If you did not request this, ignore this email.</p>`,
  };
}
