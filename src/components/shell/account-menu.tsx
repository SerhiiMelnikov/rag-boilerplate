"use client";

import Link from "next/link";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { signOut } from "next-auth/react";
import { UserCircle, LogOut, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { FOCUS_RING } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const ITEM =
  "flex w-full items-center gap-2 rounded px-2 py-2 text-sm text-ink data-[focus]:bg-surface-2 md:py-1.5";

// What is left of the old profile dropdown once its eight admin links move to the
// rail: identity, the account page, the theme, and the way out.
export function AccountMenu({ email }: { email: string }) {
  return (
    <Menu>
      <MenuButton
        aria-label={`Account — ${email}`}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded px-1 py-2 text-2xs text-ink-muted",
          "hover:bg-surface hover:text-ink",
          FOCUS_RING,
        )}
      >
        <UserCircle className="h-[17px] w-[17px]" aria-hidden="true" />
        Account
      </MenuButton>
      <MenuItems
        transition
        anchor="right end"
        className={cn(
          "z-50 ml-2 w-56 rounded-lg border border-border bg-surface p-1 shadow-pop",
          "transition duration-150 ease-panel data-[closed]:scale-95 data-[closed]:opacity-0",
        )}
      >
        <div className="truncate px-2 py-1.5 text-xs text-ink-subtle">{email}</div>
        <MenuItem>
          <Link href="/account" className={ITEM}>
            <Lock className="h-4 w-4" aria-hidden="true" /> Account settings
          </Link>
        </MenuItem>
        <MenuItem>
          {/* ThemeToggle is a button, so it stays keyboard-reachable as a MenuItem child. */}
          <ThemeToggle className={ITEM} />
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={ITEM}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
