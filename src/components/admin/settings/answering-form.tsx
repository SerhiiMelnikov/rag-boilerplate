"use client";

import Link from "next/link";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { CHAT_PROVIDER_IDS, EMBEDDING_PROVIDER_IDS, keyNameOf } from "@/lib/providers/catalog";
import { useAdminSettings, type AdminSettings } from "./use-admin-settings";

// A task warns when its provider needs a key that is not set. Keys live on their
// own route, so the warning links there rather than naming it in prose.
function providerMissingKey(provider: string, keys: AdminSettings["keys"]): boolean {
  const name = keyNameOf(provider);
  if (!name) return false;
  return !keys[name]?.set;
}

// Defined at module level, not nested in AnsweringForm, so the controlled inputs
// keep focus across the parent's re-renders.
function ModelRow({ label, provider, model, providers, onProvider, onModel, missingKey }: {
  label: string;
  provider: string;
  model: string;
  providers: string[];
  onProvider: (v: string) => void;
  onModel: (v: string) => void;
  missingKey: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className="flex gap-2">
        <Select ariaLabel={`${label} provider`} value={provider} onChange={onProvider} options={providers} className="min-w-32" />
        <Input aria-label={`${label} model`} value={model} onChange={(e) => onModel(e.target.value)} className="flex-1" />
      </div>
      {missingKey && (
        <p className="text-xs text-warning">
          No key set for {provider} —{" "}
          <Link href="/admin/settings/keys" className={cn("underline underline-offset-2", FOCUS_RING)}>
            add it on Provider keys
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export function AnsweringForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();

  if (loadError) {
    return (
      <>
        <PageHeader className="mx-auto max-w-2xl" title="Answering" description="Which models answer, and how they retrieve." />
        <PageBody className="mx-auto max-w-2xl">
          <Alert tone="danger">{loadError}</Alert>
        </PageBody>
      </>
    );
  }

  if (!settings) {
    return (
      <>
        <PageHeader className="mx-auto max-w-2xl" title="Answering" description="Which models answer, and how they retrieve." />
        <PageBody className="mx-auto max-w-2xl">
          <Spinner label="Loading settings" />
        </PageBody>
      </>
    );
  }

  const s = settings;
  const num = (key: keyof AdminSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch({ [key]: Number(e.target.value) } as Partial<AdminSettings>);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only this page's fields. Anything else would clobber a value another
    // Settings route owns.
    await save({
      chatProvider: s.chatProvider, chatModel: s.chatModel,
      embeddingProvider: s.embeddingProvider, embeddingModel: s.embeddingModel,
      parserProvider: s.parserProvider, parserModel: s.parserModel,
      imageProvider: s.imageProvider, imageModel: s.imageModel,
      unifiedMode: s.unifiedMode, unifiedProvider: s.unifiedProvider, unifiedModel: s.unifiedModel,
      temperature: s.temperature, topK: s.topK, minSimilarity: s.minSimilarity,
      contextTokenBudget: s.contextTokenBudget, systemPrompt: s.systemPrompt,
      chatRateLimitPerMinute: s.chatRateLimitPerMinute,
      chatRateLimitPerDay: s.chatRateLimitPerDay,
    });
  }

  return (
    <>
      <PageHeader className="mx-auto max-w-2xl" title="Answering" description="Which models answer, and how they retrieve." />
      <PageBody className="mx-auto max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Card title="Models">
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  aria-label="Unified provider mode"
                  checked={s.unifiedMode}
                  onChange={(e) => patch({ unifiedMode: e.target.checked })}
                  className={cn("h-4 w-4 rounded border-border-strong accent-accent", FOCUS_RING)}
                />
                Use one provider and model for all tasks (except embedding)
              </label>
              {s.unifiedMode ? (
                <ModelRow
                  label="All tasks" provider={s.unifiedProvider} model={s.unifiedModel} providers={CHAT_PROVIDER_IDS}
                  onProvider={(v) => patch({ unifiedProvider: v })} onModel={(v) => patch({ unifiedModel: v })}
                  missingKey={providerMissingKey(s.unifiedProvider, s.keys)}
                />
              ) : (
                <>
                  <ModelRow
                    label="Chat" provider={s.chatProvider} model={s.chatModel} providers={CHAT_PROVIDER_IDS}
                    onProvider={(v) => patch({ chatProvider: v })} onModel={(v) => patch({ chatModel: v })}
                    missingKey={providerMissingKey(s.chatProvider, s.keys)}
                  />
                  <ModelRow
                    label="Document parser" provider={s.parserProvider} model={s.parserModel} providers={CHAT_PROVIDER_IDS}
                    onProvider={(v) => patch({ parserProvider: v })} onModel={(v) => patch({ parserModel: v })}
                    missingKey={providerMissingKey(s.parserProvider, s.keys)}
                  />
                  <ModelRow
                    label="Image analyzer" provider={s.imageProvider} model={s.imageModel} providers={CHAT_PROVIDER_IDS}
                    onProvider={(v) => patch({ imageProvider: v })} onModel={(v) => patch({ imageModel: v })}
                    missingKey={providerMissingKey(s.imageProvider, s.keys)}
                  />
                </>
              )}
              {/* Embedding is never folded into unified mode: anthropic cannot embed,
                  so "one provider for everything" would break retrieval outright. */}
              <ModelRow
                label="Embedding" provider={s.embeddingProvider} model={s.embeddingModel} providers={EMBEDDING_PROVIDER_IDS}
                onProvider={(v) => patch({ embeddingProvider: v })} onModel={(v) => patch({ embeddingModel: v })}
                missingKey={providerMissingKey(s.embeddingProvider, s.keys)}
              />
            </div>
          </Card>

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

          <Card title="Limits and prompt">
            <div className="flex flex-col gap-4">
              <Field label="Chat requests / minute" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.chatRateLimitPerMinute} onChange={num("chatRateLimitPerMinute")} />}
              </Field>
              <Field label="Chat requests / day" description="0 turns the limit off.">
                {(control) => <Input {...control} type="number" value={s.chatRateLimitPerDay} onChange={num("chatRateLimitPerDay")} />}
              </Field>
              <Field label="System prompt">
                {(control) => (
                  <Textarea {...control} rows={4} value={s.systemPrompt} onChange={(e) => patch({ systemPrompt: e.target.value })} />
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
