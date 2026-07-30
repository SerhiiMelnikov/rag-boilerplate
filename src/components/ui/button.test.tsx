// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, FOCUS_RING } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save changes</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("carries the shared focus ring so keyboard users see the same affordance everywhere", () => {
    render(<Button>Save changes</Button>);
    const cls = screen.getByRole("button").className;
    for (const utility of FOCUS_RING.split(" ")) expect(cls).toContain(utility);
  });

  it("keeps a 44px minimum hit area below the md breakpoint", () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-11");
  });

  it("while loading is disabled, marked busy, and shows the spinner", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save changes</Button>);
    const button = screen.getByRole("button", { name: /Save changes/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status", { name: "Working" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("passes disabled through without a loading state", () => {
    render(<Button disabled>Save changes</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });
});
