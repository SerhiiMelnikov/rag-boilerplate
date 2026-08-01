// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "@/components/shell/mobile-nav";
import { visibleGroups } from "@/components/shell/nav-config";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signOut }));

beforeEach(() => signOut.mockClear());

describe("MobileNav", () => {
  // The bar holds four slots and the rail does not exist at this width, so any
  // destination that neither fits nor appears behind More is unreachable on a
  // phone. That is the defect this test exists to prevent.
  it.each([
    ["admin", false],
    ["admin", true],
    ["user", false],
  ])("gives every destination a route for role=%s superAdmin=%s", async (role, isSuperAdmin) => {
    render(<MobileNav email="a@b.c" role={role as "admin" | "user"} isSuperAdmin={isSuperAdmin} />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));

    for (const group of visibleGroups(role as "admin" | "user", isSuperAdmin)) {
      if (group.id === "account") continue;
      expect(
        screen.getByRole("link", { name: new RegExp(group.label), hidden: true }),
        `${group.label} is unreachable on a phone`,
      ).toBeInTheDocument();
    }
  });

  it("puts sign out and the theme toggle behind More, because the rail is not rendered at this width", async () => {
    render(<MobileNav email="a@b.c" role="user" />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: /Toggle theme/, hidden: true })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Sign out/, hidden: true }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
