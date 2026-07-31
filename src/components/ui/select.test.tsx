// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "./select";

describe("Select", () => {
  it("exposes the aria-label and shows the current value on the button", () => {
    render(<Select ariaLabel="Chat provider" value="google" onChange={() => {}} options={["google", "openai"]} />);
    const button = screen.getByLabelText("Chat provider");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("google");
  });

  it("calls onChange with the picked option", () => {
    const onChange = vi.fn();
    render(<Select ariaLabel="Chat provider" value="google" onChange={onChange} options={["google", "openai"]} />);
    fireEvent.click(screen.getByLabelText("Chat provider"));
    fireEvent.click(screen.getByText("openai"));
    expect(onChange).toHaveBeenCalledWith("openai");
  });

  it("defaults to the roomy button metrics used by the admin forms", () => {
    render(<Select ariaLabel="Chat provider" value="google" onChange={() => {}} options={["google"]} />);
    expect(screen.getByLabelText("Chat provider").className).toContain("min-h-11"); // roomy: the touch minimum applies
  });

  // Compact drops the touch minimum and tightens the metrics for the workspace
  // switcher, which sits in a fixed-height row; admin forms keep the roomier default.
  it("compact drops the touch minimum and tightens the metrics", () => {
    render(<Select compact ariaLabel="Active workspace" value="General" onChange={() => {}} options={["General"]} />);
    const cls = screen.getByLabelText("Active workspace").className;
    expect(cls).not.toContain("min-h-11"); // compact: fixed-height row, no touch minimum
  });
});
