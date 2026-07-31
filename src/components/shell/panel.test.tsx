// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelProvider } from "@/components/shell/panel-context";
import { Panel } from "@/components/shell/panel";
import { MobileHeader } from "@/components/shell/mobile-header";

// MobileHeader reads the pathname to label its trigger. Outside a router provider
// the real usePathname() returns null, which activeGroup() — typed for a string —
// dereferences and throws on. Every sibling test in this directory mocks it the
// same way.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Panel picks the aside or the drawer based on window.matchMedia. The shared jsdom
// stub in vitest.setup.ts defaults to desktop (matches: true) so tests elsewhere see
// the layout's normal, wide-screen shape without having to think about this at all.
// This file exercises the drawer specifically, so it overrides the stub per-file to
// report not-desktop, rather than changing what every other test gets by default.
beforeEach(() => {
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
