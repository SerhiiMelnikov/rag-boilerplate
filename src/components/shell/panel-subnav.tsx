"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { activeGroup } from "./nav-config";

// The panel's admin content. Two rules live here, both of them about not lying to
// the reader: the switcher appears only where the active workspace changes what the
// section shows, and a sub-nav of one entry is not rendered at all.
export function PanelSubnav() {
  const pathname = usePathname();
  const group = activeGroup(pathname);
  if (!group) return null;

  return (
    <>
      {group.workspaceScoped && (
        <div className="border-b border-border p-2">
          <WorkspaceSwitcher />
        </div>
      )}
      {group.items.length > 1 && (
        <nav aria-label={`${group.label} sections`} className="p-2">
          <p className="px-2 pb-1 pt-2 text-2xs uppercase text-ink-subtle">{group.label}</p>
          {group.items.map((item) => {
            const current = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
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
      )}
    </>
  );
}
