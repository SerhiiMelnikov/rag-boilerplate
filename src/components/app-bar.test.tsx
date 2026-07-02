// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }) }));

import { AppBar } from "@/components/app-bar";

describe("AppBar / ProfileMenu", () => {
  it("shows admin links inside the opened Profile menu for admins", async () => {
    render(<AppBar email="a@b.com" role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /documents/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("hides admin links for regular users", async () => {
    render(<AppBar email="u@b.com" role="user" />);
    await userEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.queryByRole("menuitem", { name: /documents/i })).not.toBeInTheDocument();
  });

  it("shows the Users link for super-admins", async () => {
    render(<AppBar email="a@b.com" role="admin" isSuperAdmin />);
    await userEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.getByRole("menuitem", { name: /users/i })).toBeInTheDocument();
  });

  it("hides the Users link for non-super-admins", async () => {
    render(<AppBar email="a@b.com" role="admin" isSuperAdmin={false} />);
    await userEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.queryByRole("menuitem", { name: /users/i })).not.toBeInTheDocument();
  });
});
