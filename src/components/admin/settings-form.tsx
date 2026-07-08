"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";

type KeyStatus = { set: boolean; last4: string | null };
interface AdminSettings {
  chatProvider: string; chatModel: string;
  embeddingProvider: string; embeddingModel: string;
  parserProvider: string; parserModel: string;
  imageProvider: string; imageModel: string;
  unifiedMode: boolean; unifiedProvider: string; unifiedModel: string;
  temperature: number; topK: number; minSimilarity: number; contextTokenBudget: number;
  systemPrompt: string; ollamaBaseUrl: string;
  keys: { google: KeyStatus; openai: KeyStatus; anthropic: KeyStatus };
}

const CHAT_PROVIDERS = ["google", "openai", "anthropic", "ollama"];
const EMBEDDING_PROVIDERS = ["google", "openai", "ollama"];
// Which provider needs which key column (ollama needs none).
const KEY_OF: Record<string, "google" | "openai" | "anthropic" | null> = {
  google: "google", openai: "openai", anthropic: "anthropic", ollama: null,
};

const inputCls = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

// A task warns if its provider needs a key that is not set. Keys are managed on
// the separate Provider keys page.
function providerMissingKey(provider: string, keys: AdminSettings["keys"]): boolean {
  const k = KEY_OF[provider];
  if (!k) return false;
  return !keys[k].set;
}

// Defined at module level (not nested in SettingsForm) so the controlled inputs
// keep focus across the parent's re-renders.
function ModelRow({ label, provider, model, providers, onProvider, onModel, missingKey }: {
  label: string; provider: string; model: string; providers: string[];
  onProvider: (v: string) => void; onModel: (v: string) => void; missingKey: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <div className="flex gap-2">
        <Select ariaLabel={`${label} provider`} value={provider} onChange={onProvider} options={providers} className="min-w-32" />
        <input aria-label={`${label} model`} value={model} onChange={(e) => onModel(e.target.value)} className={`${inputCls} flex-1`} />
      </div>
      {missingKey && (
        <span className="text-xs text-amber-600">⚠ No key set for {provider} — add it on the Provider keys page.</span>
      )}
    </div>
  );
}

export function SettingsForm() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/settings");
      if (res.ok) setS(await res.json());
    })();
  }, []);

  if (!s) return <div className="p-6 text-zinc-500">Loading...</div>;

  // Non-null alias so closures (e.g. save) keep the narrowed type.
  const cfg: AdminSettings = s;
  const set = (patch: Partial<AdminSettings>) => setS({ ...s, ...patch });
  const num = (key: keyof AdminSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Number(e.target.value) } as Partial<AdminSettings>);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body: Record<string, unknown> = {
      chatProvider: cfg.chatProvider, chatModel: cfg.chatModel,
      embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel,
      parserProvider: cfg.parserProvider, parserModel: cfg.parserModel,
      imageProvider: cfg.imageProvider, imageModel: cfg.imageModel,
      unifiedMode: cfg.unifiedMode, unifiedProvider: cfg.unifiedProvider, unifiedModel: cfg.unifiedModel,
      temperature: cfg.temperature, topK: cfg.topK, minSimilarity: cfg.minSimilarity,
      contextTokenBudget: cfg.contextTokenBudget, systemPrompt: cfg.systemPrompt,
    };
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) {
      setS(await res.json());
      setSaved(true);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Models</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label="Unified provider mode" checked={s.unifiedMode} onChange={(e) => set({ unifiedMode: e.target.checked })} />
          Use one provider + model for all tasks (except embedding)
        </label>
        {s.unifiedMode ? (
          <ModelRow label="All tasks" provider={s.unifiedProvider} model={s.unifiedModel} providers={CHAT_PROVIDERS}
            onProvider={(v) => set({ unifiedProvider: v })} onModel={(v) => set({ unifiedModel: v })}
            missingKey={providerMissingKey(s.unifiedProvider, s.keys)} />
        ) : (
          <>
            <ModelRow label="Chat" provider={s.chatProvider} model={s.chatModel} providers={CHAT_PROVIDERS}
              onProvider={(v) => set({ chatProvider: v })} onModel={(v) => set({ chatModel: v })}
              missingKey={providerMissingKey(s.chatProvider, s.keys)} />
            <ModelRow label="Document parser" provider={s.parserProvider} model={s.parserModel} providers={CHAT_PROVIDERS}
              onProvider={(v) => set({ parserProvider: v })} onModel={(v) => set({ parserModel: v })}
              missingKey={providerMissingKey(s.parserProvider, s.keys)} />
            <ModelRow label="Image analyzer" provider={s.imageProvider} model={s.imageModel} providers={CHAT_PROVIDERS}
              onProvider={(v) => set({ imageProvider: v })} onModel={(v) => set({ imageModel: v })}
              missingKey={providerMissingKey(s.imageProvider, s.keys)} />
          </>
        )}
        <ModelRow label="Embedding" provider={s.embeddingProvider} model={s.embeddingModel} providers={EMBEDDING_PROVIDERS}
          onProvider={(v) => set({ embeddingProvider: v })} onModel={(v) => set({ embeddingModel: v })}
          missingKey={providerMissingKey(s.embeddingProvider, s.keys)} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Behavior</h2>
        <label className="flex flex-col gap-1 text-sm">Temperature
          <input type="number" step="0.1" aria-label="Temperature" value={s.temperature} onChange={num("temperature")} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Top-K (retrieved chunks)
          <input type="number" aria-label="Top-K" value={s.topK} onChange={num("topK")} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Min similarity
          <input type="number" step="0.05" aria-label="Min similarity" value={s.minSimilarity} onChange={num("minSimilarity")} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Context token budget
          <input type="number" aria-label="Context token budget" value={s.contextTokenBudget} onChange={num("contextTokenBudget")} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">System prompt
          <textarea aria-label="System prompt" value={s.systemPrompt} rows={4} onChange={(e) => set({ systemPrompt: e.target.value })} className={inputCls} />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
