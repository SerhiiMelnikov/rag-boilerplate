import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Hash a plaintext password with bcrypt. Never store or log the plaintext.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Verify a plaintext password against a stored bcrypt hash.
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
