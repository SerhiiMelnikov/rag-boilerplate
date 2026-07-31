// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Rail } from "@/components/shell/rail";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const signOut = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signOut }));

beforeEach(() => {
  pathname.current = "/";
  signOut.mockClear();
});

describe("Rail", () => {
  it("gives a plain user chat and the account menu, and no admin destinations", () => {
    render(<Rail email="anna@acme.com" role="user" />);
    expect(screen.getByRole("link", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Account/ })).toBeInTheDocument();
    for (const label of ["Knowledge", "Insights", "Settings", "People"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("gives an admin the four admin destinations but not People", () => {
    render(<Rail email="admin@acme.com" role="admin" />);
    for (const label of ["Chat", "Knowledge", "Insights", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();
  });

  it("gives a super-admin People too", () => {
    render(<Rail email="root@acme.com" role="admin" isSuperAdmin />);
    expect(screen.getByRole("link", { name: "People" })).toBeInTheDocument();
  });

  it("marks the active section for assistive tech, not just with colour", () => {
    pathname.current = "/admin/keys";
    render(<Rail email="admin@acme.com" role="admin" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Chat" })).not.toHaveAttribute("aria-current");
  });

  it("opens the account menu with the email, the account link, the theme toggle and sign out", async () => {
    render(<Rail email="anna@acme.com" role="user" />);
    await userEvent.click(screen.getByRole("button", { name: /Account/ }));
    expect(screen.getByText("anna@acme.com")).toBeInTheDocument();

    // Headless UI stamps role="menuitem" onto whatever a MenuItem wraps, which
    // overrides an anchor's native link role. Every row is therefore queried as a
    // menuitem — the convention app-bar.test.tsx already established.
    expect(screen.getByRole("menuitem", { name: /Account settings/ })).toHaveAttribute("href", "/account");

    // This one is a regression guard for a real defect found while building the
    // rail. A child component that does not forward arbitrary props never receives
    // the injected role, so the menu's tree-walker stamps role="none" on it: the
    // row still works with a mouse and looks perfectly fine, while being invisible
    // to assistive tech and skipped by the menu's keyboard navigation.
    expect(screen.getByRole("menuitem", { name: /Toggle theme/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
