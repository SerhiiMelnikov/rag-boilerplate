"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { activeGroup, visibleGroups, type NavGroup } from "./nav-config";
import { AccountMenu } from "./account-menu";

function RailLink({ group, active }: { group: NavGroup; active: boolean }) {
  const Icon = group.icon;
  return (
    <Link
      href={group.href}
      // Colour alone never carries state: assistive tech reads aria-current.
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 rounded px-1 py-2 text-center text-2xs leading-tight tracking-normal",
        "transition-colors duration-100",
        active ? "bg-surface text-accent shadow-raise font-semibold" : "text-ink-muted hover:bg-surface hover:text-ink",
        FOCUS_RING,
      )}
    >
      <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
      {group.label}
    </Link>
  );
}

// The rail is always present — a plain user simply sees two entries. Two shells,
// one for admins and one for everyone else, would be twice the surface to keep
// honest for no gain.
export function Rail({
  email,
  role,
  isSuperAdmin = false,
}: {
  email: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const active = activeGroup(pathname);
  const groups = visibleGroups(role, isSuperAdmin).filter((group) => group.id !== "account");

  return (
    // Hidden below md, where mobile-nav.tsx takes over as a bottom bar.
    <nav
      aria-label="Sections"
      className="hidden w-rail flex-none flex-col gap-0.5 border-r border-border bg-surface-2 p-1.5 md:flex"
    >
      <Link
        href="/"
        aria-label="RAG Chat home"
        className={cn("mb-1.5 flex h-[30px] items-center justify-center rounded", FOCUS_RING)}
      >
        <span
          aria-hidden="true"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-sm bg-accent text-2xs font-bold tracking-normal text-accent-ink"
        >
          R
        </span>
      </Link>

      {groups.map((group) => (
        <RailLink key={group.id} group={group} active={active?.id === group.id} />
      ))}

      <div className="mt-auto">
        <AccountMenu email={email} />
      </div>
    </nav>
  );
}
