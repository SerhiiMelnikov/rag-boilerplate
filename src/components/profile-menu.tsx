"use client";

import { Menu, MenuButton, MenuItems, MenuItem } from "@headlessui/react";
import { signOut } from "next-auth/react";
// `Image` collides with the global/DOM Image constructor, so alias the icon import.
import { UserCircle, FileText, Settings, KeyRound, Users, LogOut, BarChart3, Image as ImageIcon } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

// Single header dropdown ("Profile") consolidating account info, admin links,
// theme control, and sign out. Headless UI Menu provides keyboard + a11y;
// the transition prop animates the panel.
export function ProfileMenu({
  email,
  role,
  isSuperAdmin,
}: {
  email: string;
  role: "admin" | "user";
  isSuperAdmin?: boolean;
}) {
  const itemClass =
    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[focus]:bg-zinc-100 dark:data-[focus]:bg-zinc-800";
  return (
    <Menu>
      <MenuButton className="flex items-center gap-2 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700">
        <UserCircle className="h-4 w-4" />
        Profile
      </MenuButton>
      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 mt-1 w-56 origin-top-right rounded-md border border-zinc-200 bg-white p-1 shadow-lg transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="truncate px-2 py-1.5 text-xs text-zinc-500">{email}</div>
        {role === "admin" && (
          <>
            <MenuItem>
              <a href="/admin/documents" className={itemClass}>
                <FileText className="h-4 w-4" /> Documents
              </a>
            </MenuItem>
            <MenuItem>
              <a href="/admin/images" className={itemClass}>
                <ImageIcon className="h-4 w-4" /> Images
              </a>
            </MenuItem>
            <MenuItem>
              <a href="/admin/settings" className={itemClass}>
                <Settings className="h-4 w-4" /> Settings
              </a>
            </MenuItem>
            <MenuItem>
              <a href="/admin/keys" className={itemClass}>
                <KeyRound className="h-4 w-4" /> Provider keys
              </a>
            </MenuItem>
            <MenuItem>
              <a href="/admin/analytics" className={itemClass}>
                <BarChart3 className="h-4 w-4" /> Analytics
              </a>
            </MenuItem>
            {isSuperAdmin && (
              <MenuItem>
                <a href="/admin/users" className={itemClass}>
                  <Users className="h-4 w-4" /> Users
                </a>
              </MenuItem>
            )}
          </>
        )}
        <MenuItem>
          {/* ThemeToggle is a button; as a MenuItem child it stays keyboard-accessible. */}
          <ThemeToggle className={itemClass} />
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={itemClass}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
