-- Backfill rows that predate the required-note rule so SET NOT NULL + the length
-- CHECK below can apply on any environment (prod may still hold NULL/blank notes
-- from other users; dev/test were cleaned, CI starts empty). Non-destructive:
-- keeps the expense, fills a placeholder the user can edit. (note > 200 chars is
-- impossible — the old CHECK already capped its length.)
UPDATE "expenses" SET "note" = 'Без описания' WHERE "note" IS NULL OR btrim("note") = '';--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_note_len";--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "note" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_note_len" CHECK (char_length("expenses"."note") between 1 and 200);