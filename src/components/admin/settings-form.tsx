"use client";

import { useEffect, useState } from "react";

interface AppSettings {
  topK: number;
  model: string;
  temperature: number;
  systemPrompt: string;
  minSimilarity: number;
  contextTokenBudget: number;
}

export function SettingsForm() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/settings");
      if (res.ok) setS(await res.json());
    })();
  }, []);

  if (!s) return <div className="p-6 text-zinc-500">Loading...</div>;

  function num(key: keyof AppSettings) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s!, [key]: Number(e.target.value) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s),
    });
    if (res.ok) {
      setS(await res.json());
      setSaved(true);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto flex max-w-xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Retrieval settings</h1>
      <label className="flex flex-col gap-1 text-sm">Top-K
        <input type="number" aria-label="Top-K" value={s.topK} onChange={num("topK")} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Model
        <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Temperature
        <input type="number" step="0.1" value={s.temperature} onChange={num("temperature")} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <label className="flex flex-col gap-1 text-sm">System prompt
        <textarea value={s.systemPrompt} onChange={(e) => setS({ ...s, systemPrompt: e.target.value })} rows={4} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Min similarity
        <input type="number" step="0.05" value={s.minSimilarity} onChange={num("minSimilarity")} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <label className="flex flex-col gap-1 text-sm">Context token budget
        <input type="number" value={s.contextTokenBudget} onChange={num("contextTokenBudget")} className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">Save</button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
      </div>
    </form>
  );
}
