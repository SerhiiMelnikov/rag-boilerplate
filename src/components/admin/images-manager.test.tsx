// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ImagesManager } from "./images-manager";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ images: [{ id: "img-1", filename: "bike.png", status: "ready", error: null, createdAt: "2026-07-07T00:00:00Z" }] }),
  })) as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("ImagesManager", () => {
  it("lists images with a thumbnail pointing at the serving route", async () => {
    render(<ImagesManager />);
    const img = (await screen.findByAltText("bike.png")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/api/images/img-1");
  });

  it("has an image-only upload input", async () => {
    render(<ImagesManager />);
    await waitFor(() => screen.getByLabelText("Upload image"));
    const input = screen.getByLabelText("Upload image") as HTMLInputElement;
    expect(input.accept).toContain("image/");
  });
});
