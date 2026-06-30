import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/config/crypto";

describe("crypto", () => {
  it("round-trips a secret", () => {
    const blob = encryptSecret("sk-secret-1234");
    expect(blob).not.toContain("sk-secret"); // ciphertext, not plaintext
    expect(decryptSecret(blob)).toBe("sk-secret-1234");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const blob = encryptSecret("sk-secret-1234");
    const raw = Buffer.from(blob, "base64");
    raw[raw.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(raw.toString("base64"))).toThrow();
  });

  it("masks to last 4 chars", () => {
    const blob = encryptSecret("sk-abcd1234");
    expect(maskSecret(blob)).toEqual({ set: true, last4: "1234" });
  });

  it("reports unset for empty input", () => {
    expect(maskSecret("")).toEqual({ set: false, last4: null });
  });
});
