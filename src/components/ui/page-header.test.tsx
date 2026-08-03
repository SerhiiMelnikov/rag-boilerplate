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
  // out narrower than its unwrapped content). The real guard was a
  // headless-Chromium measurement taken when the fix landed: the Files header
  // with a long "Upload to" workspace name overflowed by +49px at 375px and
  // +104px at 320px before, and by nothing at either width after.
  it("lets its actions slot wrap and shrink instead of pinning it to its content width", () => {
    render(<PageHeader title="Files" actions={<button type="button">Upload</button>} />);
    const actions = screen.getByTestId("page-actions");
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).not.toContain("flex-none");
  });
});
