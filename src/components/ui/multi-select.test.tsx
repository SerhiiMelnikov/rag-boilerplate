// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
});
