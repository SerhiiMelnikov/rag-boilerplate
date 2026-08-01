"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { activeGroup } from "./nav-config";
import { usePanel } from "./panel-context";

// The panel's sub-nav. One rule lives here: a sub-nav of one entry is not
// rendered at all — a list of one is noise, not navigation. The workspace
// switcher lives one level up, in Panel itself, since it applies to routes
// (like chat) that have no sub-nav here at all.
export function PanelSubnav() {
  const pathname = usePathname();
  const { setOpen } = usePanel();
  const group = activeGroup(pathname);
  if (!group || group.items.length <= 1) return null;

  return (
    <nav aria-label={`${group.label} sections`} className="p-2">
      <p className="px-2 pb-1 pt-2 text-2xs uppercase text-ink-subtle">{group.label}</p>
      {group.items.map((item) => {
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            // Both layouts persist across navigation, so on a touch drawer the
            // link would otherwise navigate behind a still-open panel.
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-2.5 text-sm md:py-1.5",
              current ? "bg-accent-soft font-semibold text-accent" : "text-ink hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
