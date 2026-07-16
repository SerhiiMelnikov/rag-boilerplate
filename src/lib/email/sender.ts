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

  const transport = createTransport({
    host: s.smtpHost,
    port: s.smtpPort,
    // Implicit TLS on 465; STARTTLS is negotiated on everything else.
    secure: s.smtpPort === 465,
    // Omit auth entirely for an open relay: passing empty credentials makes some
    // servers reject the session outright.
    ...(s.smtpUser ? { auth: { user: s.smtpUser, pass: s.smtpPassword ?? "" } } : {}),
  });

  await transport.sendMail({ from: s.smtpFrom || s.smtpUser, to: msg.to, subject: msg.subject, html: msg.html });
}
