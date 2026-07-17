import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
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

// Mints a token proving control of a mailbox. Deliberately carries no password —
// see the schema comment on emailVerificationTokens for why.
export async function createVerificationToken(
  userId: string,
  deps: VerificationDeps = {},
): Promise<string> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const token = (deps.randomToken ?? defaultToken)();
  await database.insert(emailVerificationTokens).values({
    token, userId, expiresAt: new Date(now + TOKEN_TTL_MS),
  });
  return token;
}

// Read-only existence + expiry check, for the GET that renders the "choose your
// password" form. Deliberately does not touch the row: Outlook Safe Links and
// every corporate mail scanner fetch every URL in every email with no human
// involved, and any mutation here would let one of them complete or destroy a
// registration on the user's behalf.
export async function isVerificationTokenValid(token: string, deps: VerificationDeps = {}): Promise<boolean> {
  const database = deps.database ?? defaultDb;
  const now = deps.now ? deps.now() : Date.now();
  const [row] = await database.select().from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.token, token)).limit(1);
  if (!row) return false;
  return row.expiresAt.getTime() > now;
}

// Consume the token the clicker landed on: set the password THEY just chose,
// mark the address verified, and disarm everything else this user has in flight.
// Returns false for unknown, expired, already-used, and already-verified alike —
// the caller must not tell them apart, or it tells a token-guesser which guesses
// are close.
export async function consumeVerificationToken(
  token: string,
  passwordHash: string,
  deps: VerificationDeps = {},
): Promise<boolean> {
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

    // Scoped to emailVerifiedAt IS NULL: a token must never re-set the password
    // of an account that is already verified and in use. Without this scope, a
    // token left over from a race (or a bug elsewhere) could silently reset a
    // live account's password to whatever the holder of that token chooses.
    const updated = await tx.update(users)
      .set({ passwordHash, emailVerifiedAt: new Date(now) })
      .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)))
      .returning({ id: users.id });
    if (updated.length === 0) return false;

    // Disarm EVERYTHING this user has outstanding, not just the token that was
    // clicked — the instant verification succeeds, every other live link for
    // this address (e.g. from a re-registration by someone else) becomes inert.
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId));
    return true;
  });
}
