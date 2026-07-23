ALTER TABLE "games" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;