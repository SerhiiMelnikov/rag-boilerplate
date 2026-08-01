// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "@/app/(app)/admin/layout";
import { PanelProvider } from "@/components/shell/panel-context";

const pathname = vi.hoisted(() => ({ current: "/admin/files" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/components/workspace-switcher", () => ({ WorkspaceSwitcher: () => <div /> }));

describe("AdminLayout", () => {
  it("gives every admin page the same panel and renders the page inside it", () => {
    pathname.current = "/admin/files";
    render(
      <PanelProvider>
        <AdminLayout>
          <p>page content</p>
        </AdminLayout>
      </PanelProvider>,
    );
    expect(screen.getByRole("complementary", { name: "Admin sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  // People has neither the switcher (not workspace-scoped) nor a sub-nav (one
  // entry): a panel there would be a blank bordered column on desktop, or an
  // empty drawer on touch. The spec says main takes the width instead.
  it("renders no panel for /admin/users, which has nothing to show in it", () => {
    pathname.current = "/admin/users";
    render(
      <PanelProvider>
        <AdminLayout>
          <p>page content</p>
        </AdminLayout>
      </PanelProvider>,
    );
    expect(screen.queryByRole("complementary", { name: "Admin sections" })).not.toBeInTheDocument();
    // MobileHeader is the panel's trigger, not a title bar: with no panel to open,
    // it must not render either, or the button taps dead and leaves `open` set for
    // whatever route mounts a Panel next.
    expect(screen.queryByRole("button", { name: /^Open/ })).not.toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
