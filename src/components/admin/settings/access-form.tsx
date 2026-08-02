"use client";

import { useState } from "react";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useAdminSettings, type AdminSettings } from "./use-admin-settings";

export function AccessForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();
  // The stored password is never sent back in plaintext, so this starts empty and
  // is submitted only when the admin types something.
  const [smtpPasswordInput, setSmtpPasswordInput] = useState("");

  const header = (
    <PageHeader
      className="mx-auto max-w-2xl"
      title="Access & email"
      description="Who may register, and the mailbox that sends them their verification link."
    />
  );

  if (loadError) {
    return (
      <>
        {header}
        <PageBody className="mx-auto max-w-2xl"><Alert tone="danger">{loadError}</Alert></PageBody>
      </>
    );
  }
  if (!settings) {
    return (
      <>
        {header}
        <PageBody className="mx-auto max-w-2xl"><Spinner label="Loading settings" /></PageBody>
      </>
    );
  }

  const s = settings;
  const num = (key: keyof AdminSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch({ [key]: Number(e.target.value) } as Partial<AdminSettings>);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      allowedEmailDomains: s.allowedEmailDomains,
      smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpUser: s.smtpUser, smtpFrom: s.smtpFrom,
    };
    if (smtpPasswordInput.trim() !== "") body.smtpPassword = smtpPasswordInput.trim();
    const ok = await save(body);
    if (ok) setSmtpPasswordInput("");
  }

  return (
    <>
      {header}
      <PageBody className="mx-auto max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Card title="Registration">
            <Field
              label="Allowed email domains"
              description="Comma-separated. Empty means nobody can register."
            >
              {(control) => (
                <Input
                  {...control}
                  value={s.allowedEmailDomains}
                  onChange={(e) => patch({ allowedEmailDomains: e.target.value })}
                />
              )}
            </Field>
          </Card>

          <Card title="SMTP" description="Registration returns 503 until this is filled in — there is no mailer to send the link with.">
            <div className="flex flex-col gap-4">
              <Field label="SMTP host">
                {(control) => <Input {...control} value={s.smtpHost} onChange={(e) => patch({ smtpHost: e.target.value })} />}
              </Field>
              <Field label="SMTP port">
                {(control) => <Input {...control} type="number" value={s.smtpPort} onChange={num("smtpPort")} />}
              </Field>
              <Field label="SMTP user">
                {(control) => <Input {...control} value={s.smtpUser} onChange={(e) => patch({ smtpUser: e.target.value })} />}
              </Field>
              <Field label="SMTP from">
                {(control) => <Input {...control} value={s.smtpFrom} onChange={(e) => patch({ smtpFrom: e.target.value })} />}
              </Field>
              <Field label="SMTP password">
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    placeholder={s.smtpPassword.set ? `••••${s.smtpPassword.last4 ?? ""}` : "not set"}
                    value={smtpPasswordInput}
                    onChange={(e) => setSmtpPasswordInput(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>

          {saveError && <Alert tone="danger">{saveError}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>Save</Button>
            {saved && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </PageBody>
    </>
  );
}
