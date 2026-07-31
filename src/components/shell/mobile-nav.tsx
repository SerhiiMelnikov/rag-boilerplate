"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { activeGroup, visibleGroups } from "./nav-config";

// A bottom bar holds four comfortable targets, so the rail's six entries are
// truncated to the first three plus Account. Anything beyond that stays reachable
// through the panel and the account menu.
const MAX_SLOTS = 4;

export function MobileNav({ role, isSuperAdmin = false }: { role: "admin" | "user"; isSuperAdmin?: boolean }) {
  const pathname = usePathname();
  const active = activeGroup(pathname);
  const all = visibleGroups(role, isSuperAdmin);
  const account = all.find((group) => group.id === "account");
  const primary = all.filter((group) => group.id !== "account").slice(0, MAX_SLOTS - 1);
  const groups = account ? [...primary, account] : primary;

  return (
    <nav
      aria-label="Sections"
      className="flex flex-none border-t border-border bg-surface-2 md:hidden"
    >
      {groups.map((group) => {
        const Icon = group.icon;
        const current = active?.id === group.id;
        return (
          <Link
            key={group.id}
            href={group.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-2xs tracking-normal",
              current ? "font-semibold text-accent" : "text-ink-muted",
              FOCUS_RING,
            )}
          >
            <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
            {group.label}
          </Link>
        );
      })}
    </nav>
  );
}
