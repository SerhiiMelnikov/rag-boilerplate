// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { ImageResults } from "./image-results";

describe("ImageResults", () => {
  it("renders an img per result pointing at the serving route", () => {
    render(<ImageResults images={[{ imageId: "img-1", filename: "bike.png", score: 0.9 }]} />);
    const img = screen.getByAltText("bike.png") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/images/img-1");
  });

  it("renders nothing when there are no images", () => {
    const { container } = render(<ImageResults images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
