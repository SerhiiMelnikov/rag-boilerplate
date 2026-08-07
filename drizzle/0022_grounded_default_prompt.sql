ALTER TABLE "settings" ALTER COLUMN "system_prompt" SET DEFAULT 'You are a helpful assistant.';--> statement-breakpoint
-- Data half, hand-added to the generated schema statement above.
--
-- Since 0.6.4 the admin's system prompt is prepended verbatim to GROUNDING_RULE
-- (src/lib/chat/answer-prompt.ts), and the old default's second sentence --
-- "Answer using only the provided context." -- contradicts the rule that follows
-- it: the rule exists precisely to let the model talk about the conversation
-- itself. Every install created before this migration is still carrying that
-- contradiction in its settings row.
--
-- The WHERE clause is the entire safety of this migration, and it is deliberately
-- the narrowest one available: plain `=` against the exact old default. Not LIKE,
-- not lower(), not trim(), not a prefix or substring test. A prompt an admin
-- customised -- even one that merely differs by a trailing space or a changed
-- capital -- is not equal to this string and is therefore left completely
-- untouched. There is exactly one string in the world this statement can match,
-- and it is the one this repo shipped as the default.
--
-- Rows already holding the new default match nothing here and are unaffected, so
-- re-running this statement is a no-op.
UPDATE "settings"
SET "system_prompt" = 'You are a helpful assistant.'
WHERE "system_prompt" = 'You are a helpful assistant. Answer using only the provided context.';
