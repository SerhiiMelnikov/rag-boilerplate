"use client";

import { useState } from "react";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { KEYED_PROVIDERS, HAS_OLLAMA, type KeyedProvider } from "@/lib/providers/catalog";
import { useAdminSettings, type KeyStatus } from "./use-admin-settings";

// Provider pruning never touches the masked response, so a generated project can
// receive key entries for providers it no longer ships — and, in principle, ship
// a provider the response has no entry for. Neither case may throw.
const NO_KEY: KeyStatus = { set: false, last4: null };

// Module level so the controlled input keeps focus across the parent's re-renders.
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
            <Button type="button" variant="ghost" size="sm" aria-label={`Clear ${label}`} onClick={onClear}>
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

export function KeysForm() {
  const { settings, patch, save, saving, saved, saveError, loadError } = useAdminSettings();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [pendingClear, setPendingClear] = useState<KeyedProvider | null>(null);
  const [clearing, setClearing] = useState(false);

  const header = (
    <PageHeader
      className="mx-auto max-w-2xl"
      title="Provider keys"
      description="Stored encrypted. Leave a field empty to keep the existing key."
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A key is sent only when the admin typed one; empty means "leave unchanged".
    const body: Record<string, unknown> = { ollamaBaseUrl: s.ollamaBaseUrl };
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
    await save({ [`${pendingClear.keyName}Key`]: null });
    setClearing(false);
    setPendingClear(null);
  }

  return (
    <>
      {header}
      <PageBody className="mx-auto max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {KEYED_PROVIDERS.length > 0 && (
            <Card title="API keys">
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
            {saved && <span className="text-sm text-success">Saved</span>}
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
