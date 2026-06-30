import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. The master key is the only provider-secret-related value kept in
// env; provider API keys themselves live encrypted in the DB. Read lazily so an
// app with no keys configured does not require the env var to boot.
function masterKey(): Buffer {
  const b64 = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!b64) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must decode to 32 bytes (base64)");
  return key;
}

// Returns base64(iv(12) || authTag(16) || ciphertext).
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// For admin display: never returns the plaintext, only whether it's set + last 4.
export function maskSecret(blob: string | null | undefined): { set: boolean; last4: string | null } {
  if (!blob) return { set: false, last4: null };
  try {
    return { set: true, last4: decryptSecret(blob).slice(-4) };
  } catch {
    return { set: true, last4: null };
  }
}
