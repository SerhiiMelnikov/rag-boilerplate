// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorkspaceSwitcher } from "./workspace-switcher";

const TWO = [
  { id: "w1", name: "General", isDefault: true },
  { id: "w2", name: "Marketing", isDefault: false },
];

function stubFetch(workspaces: unknown[], ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ workspaces }) })) as never);
}

beforeEach(() => {
  // jsdom keeps cookies between tests; clear ours.
  document.cookie = "active_workspace=; path=/; max-age=0";
});
afterEach(() => vi.unstubAllGlobals());

describe("WorkspaceSwitcher", () => {
  it("renders nothing when the user sees only one workspace", async () => {
    stubFetch([TWO[0]]);
    const { container } = render(<WorkspaceSwitcher />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the request fails", async () => {
    stubFetch([], false);
    const { container } = render(<WorkspaceSwitcher />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the default workspace when no cookie is set", async () => {
    stubFetch(TWO);
    render(<WorkspaceSwitcher />);
    expect(await screen.findByLabelText("Active workspace")).toHaveTextContent("General");
  });

  it("shows the workspace named by the cookie", async () => {
    document.cookie = "active_workspace=w2; path=/";
    stubFetch(TWO);
    render(<WorkspaceSwitcher />);
    expect(await screen.findByLabelText("Active workspace")).toHaveTextContent("Marketing");
  });

  it("falls back to the default when the cookie names an invisible workspace", async () => {
    document.cookie = "active_workspace=w-gone; path=/";
    stubFetch(TWO);
    render(<WorkspaceSwitcher />);
    expect(await screen.findByLabelText("Active workspace")).toHaveTextContent("General");
  });

  it("writes the cookie when a workspace is picked", async () => {
    stubFetch(TWO);
    render(<WorkspaceSwitcher />);
    fireEvent.click(await screen.findByLabelText("Active workspace"));
    fireEvent.click(await screen.findByRole("option", { name: "Marketing" }));
    await waitFor(() => expect(document.cookie).toContain("active_workspace=w2"));
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent("Marketing");
  });

  it("dispatches the workspace-changed event when a workspace is picked", async () => {
    stubFetch(TWO);
    const onSwitch = vi.fn();
    window.addEventListener("workspace-changed", onSwitch);
    try {
      render(<WorkspaceSwitcher />);
      fireEvent.click(await screen.findByLabelText("Active workspace"));
      fireEvent.click(await screen.findByRole("option", { name: "Marketing" }));
      await waitFor(() => expect(onSwitch).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener("workspace-changed", onSwitch);
    }
  });
});
