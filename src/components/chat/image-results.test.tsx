// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageResults } from "./image-results";

const TWO = [
  { imageId: "img-1", filename: "bike.png", score: 0.9 },
  { imageId: "img-2", filename: "car.png", score: 0.8 },
];

describe("ImageResults", () => {
  it("renders an img per result pointing at the serving route", () => {
    render(<ImageResults images={[TWO[0]]} />);
    const img = screen.getByAltText("bike.png") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/images/img-1");
  });

  it("renders nothing when there are no images", () => {
    const { container } = render(<ImageResults images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Thumbnails used to be <a target="_blank">, which yanked the user out of the chat.
  it("opens a thumbnail in the lightbox rather than a new tab", () => {
    render(<ImageResults images={TWO} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('a[target="_blank"]')).toBeNull();

    fireEvent.click(screen.getByLabelText("Open car.png"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toMatch(/car\.png/);
    // Opened at the clicked image, not always the first one.
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("closes the lightbox again", () => {
    render(<ImageResults images={TWO} />);
    fireEvent.click(screen.getByLabelText("Open bike.png"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
