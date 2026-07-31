"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { MoreHorizontal, LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { activeGroup, visibleGroups, type NavGroup } from "./nav-config";

// A bottom bar holds four comfortable targets. Three go to destinations; the
// fourth is always More, which carries everything that did not fit plus the
// account rows.
//
// More is not optional. The rail — and with it the account menu holding Sign out
// and the theme toggle — is `hidden md:flex`, so at this width it does not exist.
// Without this sheet a phone user could not sign out at all, and an admin could
// not reach Settings.
const MAX_SLOTS = 4;

const SHEET_ROW =
  "flex w-full items-center gap-2 rounded px-2 py-3 text-sm text-ink hover:bg-surface-2";

export function MobileNav({
  email,
  role,
  isSuperAdmin = false,
}: {
  email: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeGroup(pathname);

  const destinations = visibleGroups(role, isSuperAdmin).filter((group) => group.id !== "account");
  const inBar = destinations.slice(0, MAX_SLOTS - 1);
  const overflow = destinations.slice(MAX_SLOTS - 1);

  return (
    <>
      <nav aria-label="Sections" className="flex flex-none border-t border-border bg-surface-2 md:hidden">
        {inBar.map((group) => (
          <MobileNavLink key={group.id} group={group} current={active?.id === group.id} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={cn(
            "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-2xs tracking-normal text-ink-muted",
            FOCUS_RING,
          )}
        >
          <MoreHorizontal className="h-[17px] w-[17px]" aria-hidden="true" />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More" description={email} size="sm">
        <div className="flex flex-col gap-0.5">
          {overflow.map((group) => {
            const Icon = group.icon;
            return (
              <Link
                key={group.id}
                href={group.href}
                onClick={() => setMoreOpen(false)}
                className={cn(SHEET_ROW, FOCUS_RING)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {group.label}
              </Link>
            );
          })}
          <Link href="/account" onClick={() => setMoreOpen(false)} className={cn(SHEET_ROW, FOCUS_RING)}>
            <UserCircle className="h-4 w-4" aria-hidden="true" /> Account settings
          </Link>
          <ThemeToggle className={cn(SHEET_ROW, FOCUS_RING)} />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(SHEET_ROW, FOCUS_RING)}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      </Dialog>
    </>
  );
}

function MobileNavLink({ group, current }: { group: NavGroup; current: boolean }) {
  const Icon = group.icon;
  return (
    <Link
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
}
