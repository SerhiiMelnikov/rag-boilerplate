import nodemailer from "nodemailer";
import { getRegistrationSettings } from "@/lib/config/settings-service";

// Thrown when no SMTP host is configured. The caller turns this into a 503 rather
// than pretending a link was sent.
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("SMTP is not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export interface SendDeps {
  getSettingsFn?: typeof getRegistrationSettings;
  createTransport?: (opts: unknown) => { sendMail: (m: unknown) => Promise<unknown> };
}

export async function sendEmail(
  msg: { to: string; subject: string; html: string },
  deps: SendDeps = {},
): Promise<void> {
  const getSettingsFn = deps.getSettingsFn ?? getRegistrationSettings;
  const createTransport = deps.createTransport ?? ((o: unknown) => nodemailer.createTransport(o as never));

  const s = await getSettingsFn();
  if (!s.smtpHost) throw new EmailNotConfiguredError();
  // A user with no password is a mis-saved config (the settings schema has no
  // cross-field constraint tying the two together). Fail the same clean way as a
  // missing host rather than letting nodemailer AUTH with an empty string and
  // surface an opaque SMTP failure.
  if (s.smtpUser && !s.smtpPassword) throw new EmailNotConfiguredError();

  const transport = createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    // Implicit TLS on 465; STARTTLS is negotiated on everything else.
    secure: s.smtpPort === 465,
    // Opportunistic STARTTLS is a downgrade risk: an attacker who strips the
    // STARTTLS line from the server's EHLO gets nodemailer to AUTH in cleartext.
    // Require it whenever we are actually sending credentials. Sessions with no
    // auth (a local catcher like maildev, an internal relay) carry no secret, so
    // they stay plain and keep working.
    requireTLS: Boolean(s.smtpUser) && s.smtpPort !== 465,
    // Omit auth entirely for an open relay: passing empty credentials makes some
    // servers reject the session outright.
    ...(s.smtpUser ? { auth: { user: s.smtpUser, pass: s.smtpPassword ?? "" } } : {}),
  });

  await transport.sendMail({ from: s.smtpFrom || s.smtpUser, to: msg.to, subject: msg.subject, html: msg.html });
}
