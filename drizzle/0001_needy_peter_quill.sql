CREATE TABLE "chat_messages" (
	"token" text NOT NULL,
	"seq" integer NOT NULL,
	"seat_id" integer NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "chat_messages_token_seq_pk" PRIMARY KEY("token","seq")
);
--> statement-breakpoint
CREATE INDEX "chat_messages_token_idx" ON "chat_messages" USING btree ("token");
--> statement-breakpoint
-- Backfill: migrate chat that used to live in the vestigial games.messages
-- jsonb array into the normalized table. The old per-message `id` was already
-- a per-game monotonic counter, so it maps 1:1 onto `seq`. ON CONFLICT makes
-- this idempotent (safe to re-run against a shared dev branch). The
-- games.messages column is intentionally KEPT (not dropped) so this statement
-- stays re-runnable; it can be dropped once all pre-migration games have aged
-- out under the 7-day TTL.
INSERT INTO "chat_messages" ("token", "seq", "seat_id", "name", "text", "created_at")
SELECT g."token",
       (elem->>'id')::int,
       (elem->>'seatId')::int,
       elem->>'name',
       elem->>'text',
       elem->>'at'
FROM "games" g
CROSS JOIN LATERAL jsonb_array_elements(g."messages") AS elem
WHERE g."messages" IS NOT NULL
  AND jsonb_typeof(g."messages") = 'array'
ON CONFLICT ("token", "seq") DO NOTHING;
