"use client";

import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Loading } from "@/components/ui/loading";
import { useAdminSettings, type AdminSettings } from "./use-admin-settings";

export function AnsweringForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();

  const header = (
    <PageHeader
      className="mx-auto max-w-2xl"
      title="Answering"
      description="How much context an answer is built from, how often it may be asked for, and what shapes it."
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
        <PageBody className="mx-auto max-w-2xl"><Loading label="Loading settings" /></PageBody>
      </>
    );
  }

  const s = settings;
  const num = (key: keyof AdminSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch({ [key]: Number(e.target.value) } as Partial<AdminSettings>);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only this page's fields. Which model runs each task, and its key, belong to
    // Models; anything else here would clobber a value another Settings route owns.
    await save({
      temperature: s.temperature, topK: s.topK, minSimilarity: s.minSimilarity,
      contextTokenBudget: s.contextTokenBudget, systemPrompt: s.systemPrompt,
      chatRateLimitPerMinute: s.chatRateLimitPerMinute,
      chatRateLimitPerDay: s.chatRateLimitPerDay,
      transcribeRateLimitPerMinute: s.transcribeRateLimitPerMinute,
      transcribeRateLimitPerDay: s.transcribeRateLimitPerDay,
    });
  }

  return (
    <>
      {header}
      <PageBody className="mx-auto max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Card title="Retrieval" description="How much context an answer is built from.">
            <div className="flex flex-col gap-4">
              <Field label="Temperature">
                {(control) => <Input {...control} type="number" step="0.1" value={s.temperature} onChange={num("temperature")} />}
              </Field>
              <Field label="Top-K" description="How many chunks are retrieved per question.">
                {(control) => <Input {...control} type="number" value={s.topK} onChange={num("topK")} />}
              </Field>
              <Field label="Min similarity">
                {(control) => <Input {...control} type="number" step="0.05" value={s.minSimilarity} onChange={num("minSimilarity")} />}
              </Field>
              <Field label="Context token budget">
                {(control) => <Input {...control} type="number" value={s.contextTokenBudget} onChange={num("contextTokenBudget")} />}
              </Field>
            </div>
          </Card>

          <Card title="Limits" description="Per user, not per install.">
            <div className="flex flex-col gap-4">
              <Field label="Chat requests / minute" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.chatRateLimitPerMinute} onChange={num("chatRateLimitPerMinute")} />}
              </Field>
              <Field label="Chat requests / day" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.chatRateLimitPerDay} onChange={num("chatRateLimitPerDay")} />}
              </Field>
              <Field label="Voice transcriptions / minute" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.transcribeRateLimitPerMinute} onChange={num("transcribeRateLimitPerMinute")} />}
              </Field>
              <Field label="Voice transcriptions / day" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.transcribeRateLimitPerDay} onChange={num("transcribeRateLimitPerDay")} />}
              </Field>
            </div>
          </Card>

          <Card title="System prompt" description="Prepended to every answer the assistant gives.">
            <Field label="System prompt">
              {(control) => (
                <Textarea {...control} rows={5} value={s.systemPrompt} onChange={(e) => patch({ systemPrompt: e.target.value })} />
              )}
            </Field>
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
