// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/ui/page-header";

describe("PageHeader", () => {
  it("renders the title as the page's only h1", () => {
    render(<PageHeader title="Files" description="Everything the assistant can read." />);
    expect(screen.getByRole("heading", { level: 1, name: "Files" })).toBeInTheDocument();
    expect(screen.getByText("Everything the assistant can read.")).toBeInTheDocument();
  });

  it("renders actions beside the title", () => {
    render(<PageHeader title="Files" actions={<button type="button">Upload</button>} />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  // jsdom does not lay out flexbox, so this cannot prove the actions slot
  // actually shrinks/wraps under a narrow viewport -- it only guards the
  // class list that makes that possible in a real browser. `flex-none` (i.e.
  // flex-shrink:0) on this wrapper pegs it to its own max-content width no
  // matter how little room the header has, which also stops `flex-wrap` from
  // ever firing (wrapping only kicks in once a flex-wrap container is laid
  // out narrower than its unwrapped content). The real guard is the
  // headless-Chromium measurement in
  // .superpowers/sdd/2026-08-02-ux-6c2-admin-screens/fix-wave-report.md
  // ("B1 residual"), which renders the Files header at 320px/375px with a
  // long "Upload to" workspace name and checks the document does not scroll
  // sideways.
  it("lets its actions slot wrap and shrink instead of pinning it to its content width", () => {
    render(<PageHeader title="Files" actions={<button type="button">Upload</button>} />);
    const actions = screen.getByTestId("page-actions");
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).not.toContain("flex-none");
  });
});
