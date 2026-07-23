-- Hand-written prelude (the two ALTERs below are drizzle-generated).
--
-- Adding a FOREIGN KEY VALIDATES every existing row, so a single orphaned
-- child row — one whose game was deleted back when nothing tied them together
-- — would fail the ALTER and kill the deploy. These tables have no life of
-- their own (an orphan is unreachable by definition: no game, no way to read
-- it), so clear any residual orphans first. Captain-authorized 2026-07-23.
-- Both tables are small (hundreds of rows), so a plain DELETE is fine.
DELETE FROM "game_intents" WHERE "token" NOT IN (SELECT "token" FROM "games");--> statement-breakpoint
DELETE FROM "chat_messages" WHERE "token" NOT IN (SELECT "token" FROM "games");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_token_games_token_fk" FOREIGN KEY ("token") REFERENCES "public"."games"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_intents" ADD CONSTRAINT "game_intents_token_games_token_fk" FOREIGN KEY ("token") REFERENCES "public"."games"("token") ON DELETE cascade ON UPDATE no action;
