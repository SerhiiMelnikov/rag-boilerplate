// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Loading } from "./loading";

describe("Loading", () => {
  it("shows the label as text", () => {
    render(<Loading label="Loading files" />);
    expect(screen.getByText("Loading files")).toBeInTheDocument();
  });

  // The spinner used to carry role="status" and aria-label of its own while the
  // same words sat beside it as visible text, so every loading state on the branch
  // announced twice. Passing aria-hidden from outside looked like a fix and was
  // not one: Spinner forwards no props, and JSX exempts aria-* from excess-property
  // checking, so it type-checked and did nothing.
  it("announces once, not twice", () => {
    render(<Loading label="Loading files" />);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("Loading files");
  });

  it("announces once inline too", () => {
    render(<Loading inline label="Loading accounts" />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
