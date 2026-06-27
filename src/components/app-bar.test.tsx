// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));

import { AppBar } from "@/components/app-bar";

describe("AppBar", () => {
  it("shows the admin link for admins", () => {
    render(<AppBar email="a@b.com" role="admin" />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /documents/i })).toBeInTheDocument();
  });
  it("hides the admin link for regular users", () => {
    render(<AppBar email="u@b.com" role="user" />);
    expect(screen.queryByRole("link", { name: /documents/i })).not.toBeInTheDocument();
  });
});
