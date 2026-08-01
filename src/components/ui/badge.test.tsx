// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders its text", () => {
    render(<Badge tone="success">Ready</Badge>);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("uses a dashed border for the not-connected state, matching the gutter", () => {
    render(<Badge dashed>No workspace</Badge>);
    expect(screen.getByText("No workspace").className).toContain("border-dashed");
  });

  // Without this, `dashed` silently becoming a no-op would still pass every test
  // above — nothing asserted the *absence* of the dashed border on the common
  // case, and that border is the only signal for "not connected to the
  // knowledge base".
  it("does not use a dashed border by default", () => {
    render(<Badge>General</Badge>);
    expect(screen.getByText("General").className).not.toContain("border-dashed");
  });
});
