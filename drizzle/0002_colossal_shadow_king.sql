CREATE TABLE "game_intents" (
	"token" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"seat_id" integer,
	"payload" jsonb NOT NULL,
	"snapshot_after" jsonb,
	"version" integer NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "game_intents_token_seq_pk" PRIMARY KEY("token","seq")
);
--> statement-breakpoint
CREATE INDEX "game_intents_token_idx" ON "game_intents" USING btree ("token");