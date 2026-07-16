import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { emailVerificationTokens, users } from "@/lib/db/schema";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface VerificationDeps {
  database?: typeof defaultDb;
  now?: () => number;
  randomToken?: () => string;
}

// 32 random bytes: this is the only thing standing between a guesser and someone
// else's account, so it must not be guessable.
function defaultToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createVerificationToken(userId: string, deps: VerificationDeps = {}): Promise<string> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const token = (deps.randomToken ?? defaultToken)();
  await database.insert(emailVerificationTokens).values({
    token, userId, expiresAt: new Date(now + TOKEN_TTL_MS),
  });
  return token;
}

// Verify the token's owner, then destroy the token. Returns false for unknown,
// expired, and already-used alike — the caller must not tell them apart, or it
// tells a guesser which guesses are close.
export async function consumeVerificationToken(token: string, deps: VerificationDeps = {}): Promise<boolean> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();

  return database.transaction(async (tx) => {
    const [row] = await tx.select().from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token)).limit(1);
    if (!row) return false;
    if (row.expiresAt.getTime() <= now) {
      // Expired tokens are dead weight; drop it rather than leave it to rot.
      await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
      return false;
    }
    // Verification and deletion are one transaction: a crash between them would
    // leave a live token for an already-verified user, letting it be replayed.
    await tx.update(users).set({ emailVerifiedAt: new Date(now) }).where(eq(users.id, row.userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
    return true;
  });
}
