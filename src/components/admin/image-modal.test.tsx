// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImageModal } from "./image-modal";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ status: "processing" }) })) as never); });
afterEach(() => vi.unstubAllGlobals());

describe("ImageModal", () => {
  it("renders the image + caption and PATCHes the edited caption on save", async () => {
    const onSaved = vi.fn();
    render(<ImageModal image={{ id: "img-1", filename: "bike.png", caption: "old caption", status: "ready" }} onClose={() => {}} onSaved={onSaved} />);
    const img = screen.getByAltText("bike.png") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/images/img-1");
    const box = screen.getByLabelText("Caption") as HTMLTextAreaElement;
    expect(box.value).toBe("old caption");
    fireEvent.change(box, { target: { value: "a new caption" } });
    fireEvent.click(screen.getByText("Save caption"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, opts] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/images/img-1");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({ caption: "a new caption" });
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<ImageModal image={{ id: "img-1", filename: "bike.png", caption: "old caption", status: "ready" }} onClose={onClose} onSaved={() => {}} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
