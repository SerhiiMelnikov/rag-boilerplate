// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "@/components/ui/alert";

describe("Alert", () => {
  it("announces a danger tone assertively", () => {
    render(<Alert tone="danger">That address is not valid.</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("That address is not valid.");
  });

  it("announces info and success politely, so they never interrupt", () => {
    const { rerender } = render(<Alert tone="success">Your password has been changed.</Alert>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Alert>Registration is currently closed.</Alert>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
