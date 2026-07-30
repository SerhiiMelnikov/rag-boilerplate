// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

describe("Field", () => {
  it("associates its label with the control", () => {
    render(<Field label="Email">{(control) => <Input type="email" {...control} />}</Field>);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("points aria-describedby at both the description and the error", () => {
    render(
      <Field label="Email" description="We send the reset link here." error="That address is not valid.">
        {(control) => <Input type="email" {...control} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids).toHaveLength(2);
    const described = ids.map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("We send the reset link here.");
    expect(described).toContain("That address is not valid.");
  });

  it("marks the control invalid and announces the error only when there is one", () => {
    const { rerender } = render(<Field label="Email">{(c) => <Input {...c} />}</Field>);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Field label="Email" error="Required">{(c) => <Input {...c} />}</Field>);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("forwards required to the control", () => {
    render(<Field label="Email" required>{(c) => <Input {...c} />}</Field>);
    expect(screen.getByLabelText(/Email/)).toBeRequired();
  });
});
