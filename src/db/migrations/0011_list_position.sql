DROP INDEX "lists_space_updated_idx";--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "lists_space_position_idx" ON "lists" USING btree ("space_id","position");