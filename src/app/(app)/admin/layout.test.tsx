// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "@/app/(app)/admin/layout";
import { PanelProvider } from "@/components/shell/panel-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/files" }));
vi.mock("@/components/workspace-switcher", () => ({ WorkspaceSwitcher: () => <div /> }));

describe("AdminLayout", () => {
  it("gives every admin page the same panel and renders the page inside it", () => {
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
});
