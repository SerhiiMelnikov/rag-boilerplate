// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("renders a status role with an accessible label", () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Loading");
  });
});
