"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { ACTIVE_WORKSPACE_COOKIE, readActiveWorkspaceFromCookieString } from "@/lib/workspaces/cookie";

interface Workspace { id: string; name: string; isDefault: boolean }

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// The active workspace is a preference, not a credential: the server re-validates
// it against the user's visible workspaces on every chat request, so writing it
// from the browser cannot widen anyone's access.
function writeCookie(workspaceId: string): void {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
}

// Header control for switching the workspace the assistant answers from. Renders
// nothing when there is nothing to switch between, or when the list can't be read
// (the header must never break the app).
export function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
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
      }
    })();
  }, []);

  if (workspaces.length < 2 || !activeId) return null;

  const activeName = workspaces.find((w) => w.id === activeId)?.name ?? "";

  function onChange(name: string) {
    const picked = workspaces.find((w) => w.name === name);
    if (!picked) return;
    writeCookie(picked.id);
    setActiveId(picked.id);
  }

  return (
    <Select
      compact
      ariaLabel="Active workspace"
      value={activeName}
      onChange={onChange}
      options={workspaces.map((w) => w.name)}
      className="min-w-32"
    />
  );
}
