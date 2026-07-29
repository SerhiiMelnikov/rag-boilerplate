import { describe, it, expect, vi } from "vitest";
import { resetPassword } from "./handler";

const formReq = (fields: Record<string, string>) =>
  new Request("http://test/api/auth/reset-password", { method: "POST", body: new URLSearchParams(fields) });

const jsonReq = (body: unknown) =>
  new Request("http://test/api/auth/reset-password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

function deps(consumeResult = true) {
  return {
    consumeFn: vi.fn(async () => consumeResult),
    // A stub, not real bcrypt, so the test can assert exactly what travels to
    // consumeFn without paying (or depending on) real hashing cost.
    hashPasswordFn: vi.fn(async (pw: string) => `hashed:${pw}`),
  };
}

describe("resetPassword — form branch", () => {
  it("hashes the new password and consumes the token with it", async () => {
    const d = deps(true);
    const res = await resetPassword(formReq({ token: "tok", password: "my-new-password" }), d);
    expect(d.hashPasswordFn).toHaveBeenCalledWith("my-new-password");
    expect(d.consumeFn).toHaveBeenCalledWith("tok", "hashed:my-new-password");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?reset=1");
  });

  it("sends the clicker back to the same link on failure", async () => {
    const res = await resetPassword(formReq({ token: "tok", password: "my-new-password" }), deps(false));
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toContain("/reset?token=tok");
    expect(location).toContain("error=1");
  });

  it("never consumes a token when the password is too short", async () => {
    const d = deps(true);
    const res = await resetPassword(formReq({ token: "tok", password: "short" }), d);
    expect(d.consumeFn).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("error=1");
  });
});

describe("resetPassword — JSON branch", () => {
  it("returns a status object on success", async () => {
    const res = await resetPassword(jsonReq({ token: "tok", password: "my-new-password" }), deps(true));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "reset" });
  });

  it("rejects a malformed body", async () => {
    const res = await resetPassword(
      new Request("http://test/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
      }), deps(true));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("separates a bad input from a bad token", async () => {
    expect(await (await resetPassword(jsonReq({ token: "tok", password: "short" }), deps(true))).json())
      .toEqual({ error: "Invalid input" });
    expect(await (await resetPassword(jsonReq({ token: "tok", password: "my-new-password" }), deps(false))).json())
      .toEqual({ error: "Invalid or expired token" });
  });
});

// Unknown, expired, already-used, unverified and blocked are one outcome by
// construction (consumePasswordResetToken returns a bare boolean). This pins that
// the handler does not reintroduce a distinction of its own, and that both
// transports agree.
describe("resetPassword — the two branches cannot drift", () => {
  it("reaches the same verdict for the same input", async () => {
    const cases: Array<[Record<string, string>, boolean]> = [
      [{ token: "tok", password: "my-new-password" }, true],
      [{ token: "tok", password: "my-new-password" }, false],
      [{ token: "tok", password: "short" }, true],
      [{ token: "", password: "my-new-password" }, true],
    ];
    for (const [fields, consumeResult] of cases) {
      const formOk = (await resetPassword(formReq(fields), deps(consumeResult)))
        .headers.get("location")!.includes("/login?reset=1");
      const jsonOk = (await resetPassword(jsonReq(fields), deps(consumeResult))).status === 200;
      expect(jsonOk).toBe(formOk);
    }
  });
});
