// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelProvider } from "@/components/shell/panel-context";
import { PanelSubnav } from "@/components/shell/panel-subnav";

const pathname = vi.hoisted(() => ({ current: "/admin/files" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

beforeEach(() => {
  pathname.current = "/admin/files";
});

function renderSubnav() {
  return render(
    <PanelProvider>
      <PanelSubnav />
    </PanelProvider>,
  );
}

describe("PanelSubnav", () => {
  it("lists the active group's sub-items and marks the current one", () => {
    renderSubnav();
    expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Workspaces" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
  });

  it("renders the group's own label as the list's heading", () => {
    renderSubnav();
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
  });

  it("renders no sub-nav for a one-entry group, because a list of one is noise", () => {
    pathname.current = "/admin/users";
    renderSubnav();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });
});
