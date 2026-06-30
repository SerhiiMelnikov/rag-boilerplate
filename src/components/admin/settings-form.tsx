"use client";

import { useEffect, useState } from "react";

type KeyStatus = { set: boolean; last4: string | null };
interface AdminSettings {
  chatProvider: string; chatModel: string;
  embeddingProvider: string; embeddingModel: string;
  parserProvider: string; parserModel: string;
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

export function SettingsForm() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [keyInputs, setKeyInputs] = useState<{ google: string; openai: string; anthropic: string }>({ google: "", openai: "", anthropic: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/settings");
      if (res.ok) setS(await res.json());
    })();
  }, []);

  if (!s) return <div className="p-6 text-zinc-500">Loading...</div>;

  const set = (patch: Partial<AdminSettings>) => setS({ ...s, ...patch });
  const num = (key: keyof AdminSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Number(e.target.value) } as Partial<AdminSettings>);

  // A task warns if its provider needs a key that is neither set nor freshly typed.
  function providerMissingKey(provider: string): boolean {
    const k = KEY_OF[provider];
    if (!k) return false;
    return !s!.keys[k].set && keyInputs[k].trim() === "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body: Record<string, unknown> = {
      chatProvider: s.chatProvider, chatModel: s.chatModel,
      embeddingProvider: s.embeddingProvider, embeddingModel: s.embeddingModel,
      parserProvider: s.parserProvider, parserModel: s.parserModel,
      temperature: s.temperature, topK: s.topK, minSimilarity: s.minSimilarity,
      contextTokenBudget: s.contextTokenBudget, systemPrompt: s.systemPrompt,
      ollamaBaseUrl: s.ollamaBaseUrl,
    };
    // Send a key only when the admin typed a new value (empty = leave unchanged).
    for (const k of ["google", "openai", "anthropic"] as const) {
      if (keyInputs[k].trim() !== "") body[`${k}Key`] = keyInputs[k].trim();
    }
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) {
      setS(await res.json());
      setKeyInputs({ google: "", openai: "", anthropic: "" });
      setSaved(true);
    }
  }

  function ModelRow({ label, provider, model, providers, onProvider, onModel }: {
    label: string; provider: string; model: string; providers: string[];
    onProvider: (v: string) => void; onModel: (v: string) => void;
  }) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span>{label}</span>
        <div className="flex gap-2">
          <select aria-label={`${label} provider`} value={provider} onChange={(e) => onProvider(e.target.value)} className={inputCls}>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input aria-label={`${label} model`} value={model} onChange={(e) => onModel(e.target.value)} className={`${inputCls} flex-1`} />
        </div>
        {providerMissingKey(provider) && (
          <span className="text-xs text-amber-600">⚠ No key set for {provider} — set it below.</span>
        )}
      </div>
    );
  }

  function KeyRow({ label, k }: { label: string; k: "google" | "openai" | "anthropic" }) {
    const status = s!.keys[k];
    return (
      <label className="flex flex-col gap-1 text-sm">{label}
        <input
          type="password" aria-label={label}
          placeholder={status.set ? `••••${status.last4 ?? ""}` : "not set"}
          value={keyInputs[k]}
          onChange={(e) => setKeyInputs({ ...keyInputs, [k]: e.target.value })}
          className={inputCls}
        />
      </label>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Models</h1>
        <ModelRow label="Chat" provider={s.chatProvider} model={s.chatModel} providers={CHAT_PROVIDERS}
          onProvider={(v) => set({ chatProvider: v })} onModel={(v) => set({ chatModel: v })} />
        <ModelRow label="Embedding" provider={s.embeddingProvider} model={s.embeddingModel} providers={EMBEDDING_PROVIDERS}
          onProvider={(v) => set({ embeddingProvider: v })} onModel={(v) => set({ embeddingModel: v })} />
        <ModelRow label="Document parser" provider={s.parserProvider} model={s.parserModel} providers={CHAT_PROVIDERS}
          onProvider={(v) => set({ parserProvider: v })} onModel={(v) => set({ parserModel: v })} />
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Provider keys</h2>
        <p className="text-xs text-zinc-500">Stored encrypted. Leave a field empty to keep the existing key.</p>
        <KeyRow label="Google API key" k="google" />
        <KeyRow label="OpenAI API key" k="openai" />
        <KeyRow label="Anthropic API key" k="anthropic" />
        <label className="flex flex-col gap-1 text-sm">Ollama base URL
          <input aria-label="Ollama base URL" value={s.ollamaBaseUrl} onChange={(e) => set({ ollamaBaseUrl: e.target.value })} className={inputCls} />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
