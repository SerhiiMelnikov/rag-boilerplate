"use client";

import { useEffect, useState } from "react";

type KeyStatus = { set: boolean; last4: string | null };
type KeyName = "google" | "openai" | "anthropic";
// Only the fields this page manages; the settings endpoint returns more.
interface KeysSettings {
  ollamaBaseUrl: string;
  keys: Record<KeyName, KeyStatus>;
}

const inputCls = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

// Defined at module level so the controlled input keeps focus across re-renders.
function KeyRow({ label, status, value, onChange }: {
  label: string; status: KeyStatus; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">{label}
      <input
        type="password" aria-label={label}
        placeholder={status.set ? `••••${status.last4 ?? ""}` : "not set"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

export function ProviderKeysForm() {
  const [s, setS] = useState<KeysSettings | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<KeyName, string>>({ google: "", openai: "", anthropic: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/settings");
      if (res.ok) setS(await res.json());
    })();
  }, []);

  if (!s) return <div className="p-6 text-zinc-500">Loading...</div>;

  const cfg: KeysSettings = s;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const body: Record<string, unknown> = { ollamaBaseUrl: cfg.ollamaBaseUrl };
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

  return (
    <form onSubmit={save} className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Provider keys</h1>
        <p className="text-xs text-zinc-500">Stored encrypted. Leave a field empty to keep the existing key.</p>
        <KeyRow label="Google API key" status={s.keys.google} value={keyInputs.google} onChange={(v) => setKeyInputs({ ...keyInputs, google: v })} />
        <KeyRow label="OpenAI API key" status={s.keys.openai} value={keyInputs.openai} onChange={(v) => setKeyInputs({ ...keyInputs, openai: v })} />
        <KeyRow label="Anthropic API key" status={s.keys.anthropic} value={keyInputs.anthropic} onChange={(v) => setKeyInputs({ ...keyInputs, anthropic: v })} />
        <label className="flex flex-col gap-1 text-sm">Ollama base URL
          <input aria-label="Ollama base URL" value={s.ollamaBaseUrl} onChange={(e) => setS({ ...cfg, ollamaBaseUrl: e.target.value })} className={inputCls} />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
