-- Data-only migration; the schema is unchanged.
--
-- Since 0.5.8, registration stored an address as typed while @auth/core handed
-- OAuth's version over already lowercased, so one person could end up with two
-- rows. Canonicalise to lower case, and resolve the pairs that fork.
--
-- Canonicalisation trims too, matching src/lib/auth/users.ts's normalizeEmail
-- (`.trim().toLowerCase()`) exactly: a lower()-only canonical would leave a
-- legacy row with a stray leading/trailing space un-findable by that runtime
-- lookup forever. The PARTITION BY below uses the SAME trimmed+lower-cased key
-- as the canonical column, not just lower() -- otherwise a row differing from
-- its collision partner only by whitespace would land in a different
-- partition, escape detection as a duplicate, and then crash the second
-- statement's unique constraint when both rows independently canonicalise to
-- the same address.
--
-- The loser of a collision is renamed and blocked, never deleted and never
-- merged: merging would have to repoint conversations, messages, workspace
-- grants and ratings, which is an irreversible data migration running against
-- rows we cannot see. Renaming keeps every row intact and visible on the Users
-- page, marked plainly enough for an admin to finish the job by hand.
--
-- Two UPDATE statements, not one: a single combined UPDATE lets Postgres
-- process the winning row before the losing row within the same command, and
-- for a moment both rows would carry the same lower-cased email — which the
-- unique index on "email" rejects even though the end state is correct.
-- Renaming every loser away from the canonical address FIRST guarantees
-- nothing is still holding it when the second statement hands it to the
-- winner. (Verified against a live database: the single-statement version
-- raises "duplicate key value violates unique constraint".)
WITH ranked AS (
  SELECT
    "id",
    lower(trim("email")) AS canonical,
    row_number() OVER (
      PARTITION BY lower(trim("email"))
      -- Winner: confirmed first, then oldest, then lowest id. The last key is
      -- not decoration — two rows seeded in the same transaction share a
      -- created_at, and without it the migration would land differently on a
      -- replica than on the primary.
      ORDER BY ("email_verified_at" IS NULL), "created_at", "id"
    ) AS rank
  FROM "users"
)
UPDATE "users" AS u
SET
  "email" = split_part(r.canonical, '@', 1) || '+dup-' || left(u."id"::text, 8) || '@' || split_part(r.canonical, '@', 2),
  "blocked_at" = now()
FROM ranked r
WHERE u."id" = r."id"
  AND r.rank > 1;
--> statement-breakpoint
-- Every remaining row (the winner of a collision, or a row that never
-- collided at all) gets the lower-cased address. By now no other row can be
-- holding it — the first statement already moved every loser off of it.
WITH ranked AS (
  SELECT
    "id",
    lower(trim("email")) AS canonical,
    row_number() OVER (
      PARTITION BY lower(trim("email"))
      ORDER BY ("email_verified_at" IS NULL), "created_at", "id"
    ) AS rank
  FROM "users"
)
UPDATE "users" AS u
SET "email" = r.canonical
FROM ranked r
WHERE u."id" = r."id"
  AND r.rank = 1
  AND u."email" <> r.canonical;
