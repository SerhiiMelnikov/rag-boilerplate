// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageLightbox } from "./image-lightbox";

const THREE = [
  { imageId: "i1", filename: "one.png", score: 0.9 },
  { imageId: "i2", filename: "two.png", score: 0.8 },
  { imageId: "i3", filename: "three.png", score: 0.7 },
];

describe("ImageLightbox", () => {
  it("shows the image it was opened at, full size", () => {
    render(<ImageLightbox images={THREE} startIndex={1} onClose={() => {}} />);
    const img = screen.getByAltText("two.png") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/images/i2");
  });

  it("is a labelled modal dialog", () => {
    render(<ImageLightbox images={THREE} startIndex={0} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toMatch(/one\.png/);
  });

  it("closes on Escape, on the close button, and on a backdrop click", () => {
    const onClose = vi.fn();
    const { rerender } = render(<ImageLightbox images={THREE} startIndex={0} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<ImageLightbox images={THREE} startIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close when the image itself is clicked", () => {
    const onClose = vi.fn();
    render(<ImageLightbox images={THREE} startIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByAltText("one.png"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("steps through the images with the next/previous buttons", () => {
    render(<ImageLightbox images={THREE} startIndex={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByAltText("two.png")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(screen.getByAltText("one.png")).toBeInTheDocument();
  });

  it("steps through the images with the arrow keys", () => {
    render(<ImageLightbox images={THREE} startIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByAltText("two.png")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByAltText("one.png")).toBeInTheDocument();
  });

  it("wraps around at both ends", () => {
    render(<ImageLightbox images={THREE} startIndex={0} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText("Previous image"));
    expect(screen.getByAltText("three.png")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next image"));
    expect(screen.getByAltText("one.png")).toBeInTheDocument();
  });

  it("shows the position among the images", () => {
    render(<ImageLightbox images={THREE} startIndex={1} onClose={() => {}} />);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("offers no navigation for a single image", () => {
    render(<ImageLightbox images={[THREE[0]]} startIndex={0} onClose={() => {}} />);
    expect(screen.queryByLabelText("Next image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Previous image")).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });
});
