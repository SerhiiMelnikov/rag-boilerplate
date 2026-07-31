// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelSubnav } from "@/components/shell/panel-subnav";

const pathname = vi.hoisted(() => ({ current: "/admin/files" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

vi.mock("@/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="switcher" />,
}));

beforeEach(() => {
  pathname.current = "/admin/files";
});

describe("PanelSubnav", () => {
  it("lists the active group's sub-items and marks the current one", () => {
    render(<PanelSubnav />);
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Workspaces" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
  });

  it("renders the group's own label as the list's heading", () => {
    render(<PanelSubnav />);
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
  });

  it("shows the workspace switcher where workspace scope applies", () => {
    render(<PanelSubnav />);
    expect(screen.getByTestId("switcher")).toBeInTheDocument();
  });

  it("hides the switcher where it would be a lie — nothing under Settings is scoped", () => {
    pathname.current = "/admin/settings";
    render(<PanelSubnav />);
    expect(screen.queryByTestId("switcher")).not.toBeInTheDocument();
  });

  it("renders no sub-nav for a one-entry group, because a list of one is noise", () => {
    pathname.current = "/admin/users";
    render(<PanelSubnav />);
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });
});
