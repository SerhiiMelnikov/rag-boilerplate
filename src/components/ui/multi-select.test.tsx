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
});
