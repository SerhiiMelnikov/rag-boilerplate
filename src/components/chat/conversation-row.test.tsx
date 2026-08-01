// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationRow } from "./conversation-row";

const conversation = { id: "c1", title: "Refund policy", createdAt: new Date(0).toISOString() };

function setup(over: Partial<Parameters<typeof ConversationRow>[0]> = {}) {
  const props = {
    conversation,
    active: false,
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(
    <ul>
      <ConversationRow {...props} />
    </ul>,
  );
  return props;
}

describe("ConversationRow", () => {
  it("selects on click", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Refund policy" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("renames on Enter, trimmed", async () => {
    const { onRename } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Refund policy" }));
    const field = screen.getByLabelText("Conversation title");
    await userEvent.clear(field);
    await userEvent.type(field, "  Returns  {Enter}");
    expect(onRename).toHaveBeenCalledWith("Returns");
  });

  it("abandons the edit on Escape", async () => {
    // Escape unmounts the input, which fires blur. Without a guard the blur handler
    // would commit the very edit the user just cancelled.
    const { onRename } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Refund policy" }));
    const field = screen.getByLabelText("Conversation title");
    await userEvent.clear(field);
    await userEvent.type(field, "Returns{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Refund policy" })).toBeInTheDocument();
  });

  it("commits on blur", async () => {
    const { onRename } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Refund policy" }));
    const field = screen.getByLabelText("Conversation title");
    await userEvent.clear(field);
    await userEvent.type(field, "Returns");
    await userEvent.tab();
    expect(onRename).toHaveBeenCalledWith("Returns");
  });

  it("stays quiet when the title did not change", async () => {
    const { onRename } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Rename Refund policy" }));
    await userEvent.type(screen.getByLabelText("Conversation title"), "{Enter}");
    expect(onRename).not.toHaveBeenCalled();
  });

  it("asks the parent to delete", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete Refund policy" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
