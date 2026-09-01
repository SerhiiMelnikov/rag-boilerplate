// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentsForm } from "./documents-form";

const save = vi.fn(async () => true);
vi.mock("./use-admin-settings", () => ({
  useAdminSettings: () => ({
    settings: { documentsDirs: "/data/docs" },
    patch: vi.fn(), save, saving: false, saved: false, saveError: null, loadError: null,
  }),
}));

describe("DocumentsForm", () => {
  it("renders the configured directories and saves them", async () => {
    render(<DocumentsForm />);
    const box = screen.getByLabelText(/directories/i) as HTMLTextAreaElement;
    expect(box.value).toBe("/data/docs");
    fireEvent.submit(box.closest("form")!);
    expect(save).toHaveBeenCalledWith({ documentsDirs: "/data/docs" });
  });
});
