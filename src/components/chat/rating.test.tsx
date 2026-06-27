// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Rating } from "@/components/chat/rating";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
});

describe("Rating", () => {
  it("posts a thumbs-up rating", async () => {
    render(<Rating messageId="m1" initial={null} />);
    await userEvent.click(screen.getByRole("button", { name: /thumbs up/i }));
    expect(fetch).toHaveBeenCalledWith("/api/messages/m1/rating", expect.objectContaining({ method: "POST" }));
  });
});
