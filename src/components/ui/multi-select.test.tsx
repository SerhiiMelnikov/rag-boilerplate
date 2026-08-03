// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MultiSelect } from "./multi-select";

const OPTIONS = [
  { value: "w1", label: "General", hint: "everyone" },
  { value: "w2", label: "Marketing" },
];

describe("MultiSelect", () => {
  it("summarises the selection on the button", () => {
    render(<MultiSelect value={["w1"]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    expect(screen.getByLabelText("Workspaces")).toHaveTextContent("General");
  });

  // jsdom does not compute real layout, so this cannot prove the label
  // actually clips instead of pushing the button wider -- it only guards the
  // two classes that make that true in a real browser: `truncate` needs
  // `min-w-0` on this span, because it is a flex item inside the button and
  // without overriding the default min-width:auto it never shrinks below its
  // own text's width. The real guard is the headless-Chromium measurement in
  // .superpowers/sdd/2026-08-02-ux-6c2-admin-screens/fix-wave-report.md
  // ("B1 residual"), which renders this exact button at 320px/375px with a
  // long label and checks the document does not scroll sideways.
  it("truncates a long selected label instead of growing the trigger", () => {
    render(<MultiSelect value={["w1"]} onChange={() => {}} options={[{ value: "w1", label: "Marketing and Sales workspace" }]} ariaLabel="Workspaces" />);
    const summary = screen.getByLabelText("Workspaces").querySelector("span")!;
    expect(summary.className).toContain("min-w-0");
    expect(summary.className).toContain("truncate");
  });

  it("summarises multiple selections by count", () => {
    render(<MultiSelect value={["w1", "w2"]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    expect(screen.getByLabelText("Workspaces")).toHaveTextContent("2 selected");
  });

  it("shows the placeholder when nothing is selected", () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" placeholder="none" />);
    expect(screen.getByLabelText("Workspaces")).toHaveTextContent("none");
  });

  it("adds a value when an unselected option is picked", async () => {
    const onChange = vi.fn();
    render(<MultiSelect value={["w1"]} onChange={onChange} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    fireEvent.click(await screen.findByRole("option", { name: /Marketing/ }));
    expect(onChange).toHaveBeenCalledWith(["w1", "w2"]);
  });

  it("renders the hint next to an option", async () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    expect(await screen.findByText("everyone")).toBeInTheDocument();
  });

  it("filters the options by the typed query", async () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    expect(await screen.findByRole("option", { name: /General/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter workspaces"), { target: { value: "mark" } });

    expect(await screen.findByRole("option", { name: /Marketing/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /General/ })).not.toBeInTheDocument();
  });

  it("keeps a selected value that the filter hides", async () => {
    const onChange = vi.fn();
    render(<MultiSelect value={["w1"]} onChange={onChange} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    fireEvent.change(screen.getByLabelText("Filter workspaces"), { target: { value: "mark" } });
    fireEvent.click(await screen.findByRole("option", { name: /Marketing/ }));
    // w1 is filtered out of view but must not be dropped from the selection.
    expect(onChange).toHaveBeenCalledWith(["w1", "w2"]);
  });

  it("still closes the panel on Escape from the filter field", async () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    const input = await screen.findByLabelText("Filter workspaces");
    fireEvent.keyDown(input, { key: "Escape" });
    // The isolated keydown handler must not swallow Escape: Listbox still owns it.
    await waitFor(() => expect(screen.queryByLabelText("Filter workspaces")).not.toBeInTheDocument());
  });

  it("still closes the panel on Tab from the filter field", async () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    const input = await screen.findByLabelText("Filter workspaces");
    fireEvent.keyDown(input, { key: "Tab" });
    // The isolated keydown handler must not swallow Tab: Listbox still owns it.
    await waitFor(() => expect(screen.queryByLabelText("Filter workspaces")).not.toBeInTheDocument());
  });

  it("typing a printable character (including space) filters instead of reaching Listbox's own selection handling", async () => {
    const onChange = vi.fn();
    render(<MultiSelect value={[]} onChange={onChange} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    const input = await screen.findByLabelText("Filter workspaces");
    const listbox = screen.getByRole("listbox");
    // ArrowDown is deliberately not intercepted, so it reaches Listbox and makes
    // "General" the active option (confirmed once aria-activedescendant is set).
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => expect(listbox.getAttribute("aria-activedescendant")).not.toBeNull());
    // Listbox's own key handler treats Space as "select the active option" whenever
    // its internal typeahead search buffer is empty (which it always is here, since
    // printable keys never reach it) -- exactly the accidental selection the filter
    // field's isolation must prevent. Give the (wrongly expected) async selection a
    // moment to land before asserting it did not happen.
    fireEvent.keyDown(input, { key: " " });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onChange).not.toHaveBeenCalled();

    // The character still reaches our own filter, unaffected by the isolation.
    fireEvent.change(input, { target: { value: "m" } });
    expect(await screen.findByRole("option", { name: /Marketing/ })).toBeInTheDocument();
  });

  it("starts with an empty filter after a keyboard-only reopen (no click at all)", async () => {
    render(<MultiSelect value={[]} onChange={() => {}} options={OPTIONS} ariaLabel="Workspaces" />);
    fireEvent.click(screen.getByLabelText("Workspaces"));
    fireEvent.change(await screen.findByLabelText("Filter workspaces"), { target: { value: "mark" } });
    fireEvent.keyDown(screen.getByLabelText("Filter workspaces"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Filter workspaces")).not.toBeInTheDocument());

    // Reopen via ArrowDown on the focused button: Headless UI calls openListbox()
    // directly for this path and never synthesizes a click.
    const button = screen.getByLabelText("Workspaces");
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });

    const reopenedInput = await screen.findByLabelText("Filter workspaces");
    expect(reopenedInput).toHaveValue("");
    expect(await screen.findByRole("option", { name: /General/ })).toBeInTheDocument();
  });
});
