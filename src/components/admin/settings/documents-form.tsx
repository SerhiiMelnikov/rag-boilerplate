"use client";

import { Page } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { useAdminSettings } from "./use-admin-settings";

export function DocumentsForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();

  // `frame` factors out the page chrome shared by the load-error, loading and
  // content branches, matching the pattern the other Settings forms use.
  const frame = (body: React.ReactNode) => (
    <Page
      width="form"
      title="Documents"
      description="Directories on the server that Sync ingests documents from (one path per line)."
    >
      {body}
    </Page>
  );

  if (loadError) return frame(<Alert tone="danger">{loadError}</Alert>);
  if (!settings) return frame(<Loading label="Loading settings" />);

  const s = settings;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only this page's field. settingsPatchSchema is partial, so a subset body
    // leaves every other stored column untouched.
    await save({ documentsDirs: s.documentsDirs });
  }

  return frame(
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Documents directories"
        description="One absolute path per line."
      >
        {(control) => (
          <Textarea
            {...control}
            rows={5}
            value={s.documentsDirs}
            onChange={(e) => patch({ documentsDirs: e.target.value })}
            placeholder={"/data/docs\n/data/handbook"}
          />
        )}
      </Field>

      {saveError && <Alert tone="danger">{saveError}</Alert>}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>Save</Button>
        {saved && <span className="text-sm text-success">Saved</span>}
      </div>
    </form>,
  );
}
