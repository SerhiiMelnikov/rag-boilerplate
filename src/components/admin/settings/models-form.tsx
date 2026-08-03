"use client";

import { useState } from "react";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loading } from "@/components/ui/loading";
import { cn } from "@/lib/cn";
import {
  CHAT_PROVIDER_IDS,
  EMBEDDING_PROVIDER_IDS,
  KEYED_PROVIDERS,
  HAS_OLLAMA,
  keyNameOf,
  type KeyedProvider,
} from "@/lib/providers/catalog";
import { useAdminSettings, type AdminSettings, type KeyStatus } from "./use-admin-settings";

// Provider pruning never touches the masked response, so a generated project can
// receive key entries for providers it no longer ships — and, in principle, ship
// a provider the response has no entry for. Neither case may throw.
const NO_KEY: KeyStatus = { set: false, last4: null };

// A task warns when its provider needs a key that is not set. The keys now live
// on this same page, so the warning points down the page rather than away from it.
function providerMissingKey(provider: string, keys: AdminSettings["keys"]): boolean {
  const name = keyNameOf(provider);
  if (!name) return false;
  return !keys[name]?.set;
}

// Defined at module level, not nested in ModelsForm, so the controlled inputs
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
      <div className="flex flex-wrap gap-2">
        <Select ariaLabel={`${label} provider`} value={provider} onChange={onProvider} options={providers} className="min-w-32" />
        <Input aria-label={`${label} model`} value={model} onChange={(e) => onModel(e.target.value)} className="min-w-0 flex-1" />
      </div>
      {missingKey && <p className="text-xs text-warning">No key set for {provider} — add it under API keys below.</p>}
    </div>
  );
}

// Module level for the same focus reason as ModelRow.
function KeyRow({ provider, status, value, onChange, onClear }: {
  provider: KeyedProvider;
  status: KeyStatus;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const label = `${provider.label} API key`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-muted">{provider.label}</span>
        {status.set ? (
          <span className="flex items-center gap-2">
            <Badge tone="success">····{status.last4 ?? ""}</Badge>
            <Button type="button" variant="ghost" size="sm" aria-label={`Clear ${label}`} title="Clear" onClick={onClear}>
              Clear
            </Button>
          </span>
        ) : (
          <Badge dashed>not set</Badge>
        )}
      </div>
      <Input
        type="password"
        aria-label={label}
        placeholder={status.set ? "Replace this key" : "Paste the key"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ModelsForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [pendingClear, setPendingClear] = useState<KeyedProvider | null>(null);
  const [clearing, setClearing] = useState(false);

  const header = (
    <PageHeader
      className="mx-auto max-w-2xl"
      title="Models"
      description="Which model answers each task, and the keys it authenticates with."
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
  // `saved` comes from the hook, which only knows about edits routed through `patch`.
  // A typed key is local state it never sees, so an untouched "Saved" would sit over
  // a secret the admin cannot read back from anywhere.
  const dirty = Object.values(typed).some((v) => v.trim() !== "");

  // Every field this page owns. Both submit and Clear send the whole set, because
  // either one adopts the server's response wholesale — sending a subset would
  // silently discard whatever else the admin had changed but not yet saved.
  const ownFields = (): Record<string, unknown> => ({
    chatProvider: s.chatProvider, chatModel: s.chatModel,
    embeddingProvider: s.embeddingProvider, embeddingModel: s.embeddingModel,
    parserProvider: s.parserProvider, parserModel: s.parserModel,
    imageProvider: s.imageProvider, imageModel: s.imageModel,
    unifiedMode: s.unifiedMode, unifiedProvider: s.unifiedProvider, unifiedModel: s.unifiedModel,
    ollamaBaseUrl: s.ollamaBaseUrl,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = ownFields();
    // A key is sent only when the admin typed one; empty means "leave unchanged".
    for (const p of KEYED_PROVIDERS) {
      const value = (typed[p.id] ?? "").trim();
      if (value !== "") body[`${p.keyName}Key`] = value;
    }
    const ok = await save(body);
    // Only on success: a rejected save must leave the typed keys on screen, or
    // the admin loses a secret they cannot read back from anywhere.
    if (ok) setTyped({});
  }

  async function confirmClear() {
    if (!pendingClear) return;
    setClearing(true);
    // null is the schema's documented "clear this key". Nothing could send it
    // before this page existed.
    await save({ ...ownFields(), [`${pendingClear.keyName}Key`]: null });
    setClearing(false);
    setPendingClear(null);
  }

  return (
    <>
      {header}
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

          {KEYED_PROVIDERS.length > 0 && (
            <Card title="API keys" description="Stored encrypted. Leave a field empty to keep the existing key.">
              <div className="flex flex-col gap-4">
                {KEYED_PROVIDERS.map((p) => (
                  <KeyRow
                    key={p.id}
                    provider={p}
                    status={s.keys[p.keyName] ?? NO_KEY}
                    value={typed[p.id] ?? ""}
                    onChange={(v) => setTyped((prev) => ({ ...prev, [p.id]: v }))}
                    onClear={() => setPendingClear(p)}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Ollama authenticates with nothing — it needs an address, not a key.
              The catalog decides whether this renders at all: a generated project
              without ollama has no entry, so there is nothing here to prune. */}
          {HAS_OLLAMA && (
            <Card title="Ollama" description="No key — Ollama runs wherever you point it.">
              {/* No aria-label: `control` carries the id Field's <label> points at,
                  so the accessible name comes from text the admin can actually see.
                  KeyRow above needs an explicit one only because it has no Field. */}
              <Field label="Ollama base URL">
                {(control) => (
                  <Input
                    {...control}
                    value={s.ollamaBaseUrl}
                    onChange={(e) => patch({ ollamaBaseUrl: e.target.value })}
                  />
                )}
              </Field>
            </Card>
          )}

          {saveError && <Alert tone="danger">{saveError}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>Save</Button>
            {saved && !dirty && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </PageBody>

      <ConfirmDialog
        open={pendingClear !== null}
        title={pendingClear ? `Clear the ${pendingClear.label} API key?` : ""}
        description="Every task using this provider stops working until a new key is set."
        confirmLabel="Clear key"
        pending={clearing}
        onConfirm={confirmClear}
        onCancel={() => setPendingClear(null)}
      />
    </>
  );
}
