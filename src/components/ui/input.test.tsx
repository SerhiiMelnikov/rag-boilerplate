// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/button";

describe("Input", () => {
  it("accepts typing and forwards native props", async () => {
    render(<Input aria-label="Search" placeholder="Search files" />);
    const input = screen.getByLabelText("Search");
    await userEvent.type(input, "report");
    expect(input).toHaveValue("report");
    expect(input).toHaveAttribute("placeholder", "Search files");
  });

  it("carries the shared focus ring", () => {
    render(<Input aria-label="Search" />);
    const cls = screen.getByLabelText("Search").className;
    for (const utility of FOCUS_RING.split(" ")) expect(cls).toContain(utility);
  });

  it("shows the danger border when invalid", () => {
    render(<Input aria-label="Search" invalid />);
    expect(screen.getByLabelText("Search").className).toContain("border-danger");
  });
});
