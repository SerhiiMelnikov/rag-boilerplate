// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationRow, renameIntent } from "./conversation-row";

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

// jsdom does not fire blur when a focused element is removed from the DOM, so the
// Escape-then-unmount path above cannot prove the cancelled guard matters. The rule
// it guards is pure, so it is exercised directly here instead.
describe("renameIntent", () => {
  it("cancelled with a changed draft yields no rename", () => {
    expect(renameIntent("Returns", "Refund policy", true)).toBeNull();
  });

  it("cancelled with an unchanged draft yields no rename", () => {
    expect(renameIntent("Refund policy", "Refund policy", true)).toBeNull();
  });

  it("not cancelled, changed and untrimmed, yields the trimmed title", () => {
    expect(renameIntent("  Returns  ", "Refund policy", false)).toBe("Returns");
  });

  it("not cancelled, unchanged, yields no rename", () => {
    expect(renameIntent("Refund policy", "Refund policy", false)).toBeNull();
  });

  it("not cancelled, whitespace-only, yields no rename", () => {
    expect(renameIntent("   ", "Refund policy", false)).toBeNull();
  });

  it("not cancelled, empty, yields no rename", () => {
    expect(renameIntent("", "Refund policy", false)).toBeNull();
  });
});
