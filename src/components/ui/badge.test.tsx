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
});
