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
});
