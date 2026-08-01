// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelProvider } from "@/components/shell/panel-context";
import { Panel } from "@/components/shell/panel";
import { MobileHeader } from "@/components/shell/mobile-header";

// MobileHeader and Panel both read the pathname — MobileHeader to label its
// trigger, Panel to decide whether the active group is workspace-scoped. Outside a
// router provider the real usePathname() returns null, which activeGroup() —
// typed for a string — dereferences and throws on. Every sibling test in this
// directory mocks it the same way. Defaults to "/" (chat, workspace-scoped), which
// keeps the pre-existing "Open Conversations" tests below unaffected.
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

vi.mock("@/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="switcher" />,
}));

// Panel picks the aside or the drawer based on window.matchMedia. The shared jsdom
// stub in vitest.setup.ts defaults to desktop (matches: true) so tests elsewhere see
// the layout's normal, wide-screen shape without having to think about this at all.
// This file exercises the drawer specifically, so it overrides the stub per-file to
// report not-desktop, rather than changing what every other test gets by default.
beforeEach(() => {
  pathname.current = "/";
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function Harness() {
  return (
    <PanelProvider>
      <MobileHeader />
      <Panel label="Conversations">
        <a href="/x">Q3 revenue drivers</a>
      </Panel>
    </PanelProvider>
  );
}

describe("Panel drawer", () => {
  it("starts closed, with the trigger reporting so", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open Conversations" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens from the trigger and flips aria-expanded", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open Conversations" }));
    expect(screen.getByRole("dialog", { name: "Conversations" })).toBeInTheDocument();
    // While the drawer is open, Headless UI marks everything outside its portal
    // aria-hidden — correct modal behaviour, and it hides the trigger from role
    // queries until you ask for hidden elements. Same pattern as
    // workspaces-manager.test.tsx.
    expect(screen.getByRole("button", { name: "Open Conversations", hidden: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open Conversations" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    // The leave transition never completes in jsdom, so the unmount and the focus
    // restoration both land a tick later than the keypress.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});

describe("Panel workspace switcher", () => {
  // The switcher used to live inside PanelSubnav, which only the admin layout
  // rendered — so a plain user, who never sees an admin route, had no way to
  // switch workspace at all. It now lives in Panel itself, which every
  // workspace-scoped route mounts, chat included. Headless UI's Dialog does not
  // render its content until open, so these open the drawer first.
  it("shows the workspace switcher when the active group is workspace-scoped", async () => {
    pathname.current = "/"; // chat: workspaceScoped
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open Conversations" }));
    expect(screen.getByTestId("switcher")).toBeInTheDocument();
  });

  it("hides the switcher where it would be a lie — nothing under Settings is scoped", async () => {
    pathname.current = "/admin/settings";
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    expect(screen.queryByTestId("switcher")).not.toBeInTheDocument();
  });

  // Every other case in this file stubs matchMedia to not-desktop, so they only
  // ever exercise the drawer branch — the static aside, the one every desktop
  // user actually sees, was never rendered by this suite at all. Override the
  // stub locally, the same way the file's own beforeEach does it, rather than
  // touching what the other cases get by default.
  it("shows the workspace switcher in the static aside on desktop", () => {
    pathname.current = "/"; // chat: workspaceScoped
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })),
    );
    render(<Harness />);
    const aside = screen.getByRole("complementary", { name: "Conversations" });
    expect(within(aside).getByTestId("switcher")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
