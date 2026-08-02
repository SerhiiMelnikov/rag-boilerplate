"use client";

import { useCallback, useEffect, useState } from "react";

export type KeyStatus = { set: boolean; last4: string | null };

// The shape GET /api/admin/settings returns. `keys` is a plain record rather than
// Record<KeyName, KeyStatus>: provider pruning never touches the masked response,
// so a generated project still receives entries for providers it no longer ships,
// and a pruned project's catalog may name fewer. Read it with a fallback.
export interface AdminSettings {
  chatProvider: string; chatModel: string;
  embeddingProvider: string; embeddingModel: string;
  parserProvider: string; parserModel: string;
  imageProvider: string; imageModel: string;
  unifiedMode: boolean; unifiedProvider: string; unifiedModel: string;
  temperature: number; topK: number; minSimilarity: number; contextTokenBudget: number;
  systemPrompt: string; ollamaBaseUrl: string;
  chatRateLimitPerMinute: number; chatRateLimitPerDay: number;
  allowedEmailDomains: string;
  smtpHost: string; smtpPort: number; smtpUser: string; smtpFrom: string;
  keys: Record<string, KeyStatus>;
  smtpPassword: KeyStatus;
}

// Load once, patch locally, save a subset. Three Settings routes share the load
// and the PUT; each builds its own body, which is what keeps a page's Save
// covering exactly what is on that page. settingsPatchSchema is
// .partial().strict(), so a subset body is valid and omitted columns keep their
// stored values.
export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        if (!res.ok) {
          setLoadError("Could not load settings. Reload the page to try again.");
          return;
        }
        setSettings((await res.json()) as AdminSettings);
      } catch {
        setLoadError("Could not load settings. Reload the page to try again.");
      }
    })();
  }, []);

  const patch = useCallback((next: Partial<AdminSettings>) => {
    setSettings((current) => (current ? { ...current, ...next } : current));
    // Any edit invalidates the "Saved" confirmation still on screen.
    setSaved(false);
    setSaveError(null);
  }, []);

  const save = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // The old forms did nothing at all here, so a rejected save looked
        // exactly like a successful one that simply had not finished.
        setSaveError("Could not save. Check the values and try again.");
        return false;
      }
      setSettings((await res.json()) as AdminSettings);
      setSaved(true);
      return true;
    } catch {
      setSaveError("Could not save. Check the values and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, patch, save, saving, saved, saveError, loadError };
}
