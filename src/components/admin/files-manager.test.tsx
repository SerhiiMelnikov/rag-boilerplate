// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FilesManager } from "./files-manager";

const FILES = [
  { id: "d1", kind: "document", filename: "report.pdf", ext: "pdf", status: "ready", error: null, caption: null, createdAt: "2026-01-02T00:00:00Z", workspaces: [{ id: "w1", name: "General", isDefault: true }] },
  { id: "i1", kind: "image", filename: "bike.png", ext: "png", status: "ready", error: null, caption: "a red bicycle", createdAt: "2026-01-01T00:00:00Z", workspaces: [] },
];
const WORKSPACES = [{ id: "w1", name: "General", description: null, isDefault: true, createdAt: "2026-01-01T00:00:00Z" }];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ files: FILES, workspaces: WORKSPACES }) })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("FilesManager", () => {
  it("lists documents + images together", async () => {
    render(<FilesManager />);
    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("bike.png")).toBeInTheDocument();
  });

  it("filters by extension", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("Filter by type")); // open the styled listbox
    fireEvent.click(await screen.findByRole("option", { name: "png" }));
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("bike.png")).toBeInTheDocument();
  });

  it("opens the modal when an image row is clicked", async () => {
    render(<FilesManager />);
    fireEvent.click(await screen.findByText("bike.png"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /bike\.png/ })).toBeInTheDocument());
  });

  it("renders workspace chips and an unassigned badge", async () => {
    render(<FilesManager />);
    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("unassigned")).toBeInTheDocument();
  });

  it("opens the workspaces modal from the chips cell", async () => {
    render(<FilesManager />);
    await screen.findByText("report.pdf");
    fireEvent.click(screen.getByLabelText("Edit workspaces of report.pdf"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Workspaces for report\.pdf/ })).toBeInTheDocument());
  });
});
