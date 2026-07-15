CREATE TABLE "games" (
	"token" text PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'lobby' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"seats" jsonb NOT NULL,
	"snapshot" jsonb,
	"messages" jsonb,
	"ai" jsonb
);
