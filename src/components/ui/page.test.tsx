// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Page } from "@/components/ui/page";

describe("Page", () => {
  it("renders the title as the page's only h1", () => {
    render(
      <Page width="wide" title="Files" description="Everything the assistant can read.">
        <p>body</p>
      </Page>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Files" })).toBeInTheDocument();
    expect(screen.getByText("Everything the assistant can read.")).toBeInTheDocument();
  });

  it("renders actions beside the title", () => {
    render(
      <Page width="wide" title="Files" actions={<button type="button">Upload</button>}>
        <p>body</p>
      </Page>,
    );
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  // jsdom does not lay out flexbox, so this cannot prove the actions slot actually
  // shrinks/wraps under a narrow viewport -- it only guards the class list that makes
  // that possible in a real browser. See the component's own comment for the
  // headless-Chromium measurement that is the real evidence.
  it("lets its actions slot wrap and shrink instead of pinning it to its content width", () => {
    render(
      <Page width="wide" title="Files" actions={<button type="button">Upload</button>}>
        <p>body</p>
      </Page>,
    );
    const actions = screen.getByTestId("page-actions");
    expect(actions.className).toContain("flex-wrap");
    expect(actions.className).not.toContain("flex-none");
  });

  // The point of the collapse: one `width` prop reaches BOTH parts. The expected
  // class is written as a literal on purpose -- reading it back from the component's
  // WIDTHS map would make this test grow with any change to that map and therefore
  // unable to detect one.
  it("applies one width to both the header and the body", () => {
    render(
      <Page width="wide" title="Files">
        <p>body</p>
      </Page>,
    );
    expect(screen.getByTestId("page-header").className).toContain("max-w-6xl");
    expect(screen.getByTestId("page-body").className).toContain("max-w-6xl");
  });

  it("gives each width token its own class on both parts", () => {
    const { rerender } = render(
      <Page width="form" title="Models">
        <p>body</p>
      </Page>,
    );
    expect(screen.getByTestId("page-header").className).toContain("max-w-2xl");
    expect(screen.getByTestId("page-body").className).toContain("max-w-2xl");

    rerender(
      <Page width="narrow" title="Account">
        <p>body</p>
      </Page>,
    );
    expect(screen.getByTestId("page-header").className).toContain("max-w-xl");
    expect(screen.getByTestId("page-body").className).toContain("max-w-xl");
    // /account is the one screen that is deliberately NOT centred. Preserving that
    // exactly is what makes this branch a refactor with no visible change; whether it
    // SHOULD be centred is a separate, visual decision.
    expect(screen.getByTestId("page-header").className).not.toContain("mx-auto");
    expect(screen.getByTestId("page-body").className).not.toContain("mx-auto");
  });

  // The header and body must be SIBLINGS in the caller's flex column, not nested in a
  // wrapper: the body's `flex-1 min-h-0` scroller only works as a direct flex child.
  // A wrapper div would break scrolling on every screen, and jsdom cannot see layout,
  // so this structural assertion is the only automated guard that exists for it.
  it("renders the header and body as siblings, with no wrapper element", () => {
    const { container } = render(
      <Page width="wide" title="Files">
        <p>body</p>
      </Page>,
    );
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(screen.getByTestId("page-header"));
    expect(container.children[1]).toBe(screen.getByTestId("page-body"));
  });

  it("puts caller content spacing on the body, not the header", () => {
    render(
      <Page width="wide" title="Files" contentClassName="space-y-8">
        <p>body</p>
      </Page>,
    );
    expect(screen.getByTestId("page-body").className).toContain("space-y-8");
    expect(screen.getByTestId("page-header").className).not.toContain("space-y-8");
  });
});
