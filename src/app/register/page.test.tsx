import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import RegisterPage, { dynamic } from "./page";

const VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const v of VARS) { saved[v] = process.env[v]; delete process.env[v]; }
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("RegisterPage", () => {
  // The whole finding in one assertion. This page is synchronous and calls no
  // dynamic API, so without the opt-out Next prerenders it and evaluates
  // configuredOAuthProviderIds() against BUILD-time environment. The Dockerfile
  // builds with only DATABASE_URL set, so the OAuth buttons would be absent from
  // the baked HTML of every real deployment, with no runtime variable able to
  // bring them back — while /login, which awaits searchParams and is therefore
  // dynamic anyway, showed them. Two sign-in screens disagreeing is the symptom
  // this pins.
  it("opts out of prerendering, so provider buttons are decided at request time", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  // The reason the export above matters: the provider list really is read per
  // render, not captured once at module load.
  it("reflects the environment at render time", () => {
    const providersOf = (element: unknown) => {
      if (!React.isValidElement(element)) throw new Error("Expected valid element");
      return (element.props as { providers: string[] }).providers;
    };

    expect(providersOf(RegisterPage())).toEqual([]);

    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    expect(providersOf(RegisterPage())).toEqual(["google"]);
  });
});
