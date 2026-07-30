// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Chunks for report.pdf">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByText("Chunks for report.pdf")).not.toBeInTheDocument();
  });

  it("names the dialog with its title and renders its description and body", () => {
    render(
      <Dialog open onClose={vi.fn()} title="Chunks for report.pdf" description="128 chunks, oldest first.">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: /Chunks for report\.pdf/ })).toBeInTheDocument();
    expect(screen.getByText("128 chunks, oldest first.")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Chunks for report.pdf">
        <p>body</p>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes from its own close button", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Chunks for report.pdf">
        <p>body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
