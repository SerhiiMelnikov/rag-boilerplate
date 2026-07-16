import { describe, it, expect, vi } from "vitest";
import { sendEmail, EmailNotConfiguredError } from "./sender";

const CONFIGURED = {
  allowedEmailDomains: "company.com",
  smtpHost: "smtp.test", smtpPort: 587, smtpUser: "u", smtpFrom: "RAG <no-reply@company.com>",
  smtpPassword: "secret",
};

function transportSpy() {
  const sendMail = vi.fn(async () => ({ messageId: "1" }));
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
}

describe("sendEmail", () => {
  it("sends through the configured SMTP server", async () => {
    const { sendMail, createTransport } = transportSpy();
    await sendEmail({ to: "a@company.com", subject: "S", html: "<p>H</p>" }, {
      getSettingsFn: vi.fn(async () => CONFIGURED), createTransport,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.test", port: 587, auth: { user: "u", pass: "secret" },
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "a@company.com", from: "RAG <no-reply@company.com>", subject: "S", html: "<p>H</p>",
    }));
  });

  // Registration must fail loudly rather than pretend a link went out.
  it("throws EmailNotConfiguredError when there is no SMTP host", async () => {
    const { createTransport } = transportSpy();
    await expect(sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpHost: "" })), createTransport,
    })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("omits auth when no user is configured, rather than sending empty credentials", async () => {
    const { createTransport } = transportSpy();
    await sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpUser: "", smtpPassword: null })), createTransport,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.not.objectContaining({ auth: expect.anything() }));
  });

  it("propagates a transport failure", async () => {
    const sendMail = vi.fn(async () => { throw new Error("connection refused"); });
    await expect(sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => CONFIGURED), createTransport: vi.fn(() => ({ sendMail })),
    })).rejects.toThrow("connection refused");
  });

  // Opportunistic STARTTLS lets an attacker who strips the STARTTLS line from EHLO
  // get nodemailer to AUTH in cleartext. Require TLS whenever credentials are
  // actually sent, on any port that isn't already implicit-TLS.
  it("requires TLS when authenticating on a non-implicit-TLS port", async () => {
    const { createTransport } = transportSpy();
    await sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => CONFIGURED), createTransport,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true }));
  });

  it("does not require TLS when there is no user to authenticate", async () => {
    const { createTransport } = transportSpy();
    await sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpUser: "", smtpPassword: null })), createTransport,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.not.objectContaining({ requireTLS: true }));
  });

  it("does not require TLS on the implicit-TLS port", async () => {
    const { createTransport } = transportSpy();
    await sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpPort: 465 })), createTransport,
    });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
    expect(createTransport).toHaveBeenCalledWith(expect.not.objectContaining({ requireTLS: true }));
  });

  // Reachable state: the settings schema has no cross-field constraint tying
  // smtpUser to smtpPassword, so an admin can save a user with no password. That
  // must fail the same clean way as a missing host, not as an opaque SMTP AUTH
  // error with an empty-string password.
  it("throws EmailNotConfiguredError when a user is configured with no password", async () => {
    const { createTransport } = transportSpy();
    await expect(sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpPassword: null })), createTransport,
    })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("throws EmailNotConfiguredError when a user is configured with an empty password", async () => {
    const { createTransport } = transportSpy();
    await expect(sendEmail({ to: "a@company.com", subject: "S", html: "H" }, {
      getSettingsFn: vi.fn(async () => ({ ...CONFIGURED, smtpPassword: "" })), createTransport,
    })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
