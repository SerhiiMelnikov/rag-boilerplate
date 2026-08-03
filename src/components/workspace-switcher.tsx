"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspaceFromCookieString, WORKSPACE_CHANGED_EVENT } from "@/lib/workspaces/cookie";

interface Workspace { id: string; name: string; isDefault: boolean }

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// The active workspace is a preference, not a credential: the server re-validates
// it against the user's visible workspaces on every chat request, so writing it
// from the browser cannot widen anyone's access.
function writeCookie(workspaceId: string): void {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

// Sits at the top of the contextual panel, above the conversation list or the
// section list. Renders nothing when there is nothing to switch between, or when
// the list can't be read: the shell must never break because one fetch failed.
export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const list: Workspace[] = (await res.json()).workspaces;
      if (!Array.isArray(list) || list.length === 0) return;
      setWorkspaces(list);

      const fromCookie = readActiveWorkspaceFromCookieString(document.cookie);
      const active = list.find((w) => w.id === fromCookie) ?? list.find((w) => w.isDefault) ?? list[0];
      setActiveId(active.id);
    } catch {
      // Leave the switcher hidden.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void read(); }, [read]);

  // Something else can change the active workspace — the rail's home link forgets
  // it entirely. Re-reading the cookie on that event keeps this control showing
  // what the rest of the app is actually scoped to.
  useEffect(() => {
    const onChanged = () => {
      const fromCookie = readActiveWorkspaceFromCookieString(document.cookie);
      setWorkspaces((list) => {
        const active = list.find((w) => w.id === fromCookie) ?? list.find((w) => w.isDefault) ?? list[0];
        if (active) setActiveId(active.id);
        return list;
      });
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, onChanged);
  }, []);

  // Drawn before its data arrives, so the panel does not shift when the fetch
  // lands. An install with fewer than two workspaces has nothing to switch
  // between and the control goes away for good once that is known — the brief
  // placeholder is the price of not moving the content under someone's cursor
  // on every install that does have several.
  if (!loaded) {
    return (
      <div
        aria-hidden="true"
        className="h-[30px] w-full animate-pulse rounded border border-border-strong bg-surface-2"
      />
    );
  }

  if (workspaces.length < 2 || !activeId) return null;

  const activeName = workspaces.find((w) => w.id === activeId)?.name ?? "";

  function onChange(name: string) {
    const picked = workspaces.find((w) => w.name === name);
    if (!picked) return;
    writeCookie(picked.id);
    setActiveId(picked.id);
    window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
  }

  return (
    <Select
      compact
      ariaLabel="Active workspace"
      value={activeName}
      onChange={onChange}
      options={workspaces.map((w) => w.name)}
      className="w-full"
    />
  );
}
