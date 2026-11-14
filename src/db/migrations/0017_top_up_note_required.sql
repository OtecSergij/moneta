ALTER TABLE "top_ups" DROP CONSTRAINT "top_ups_note_len";--> statement-breakpoint
UPDATE "top_ups" SET "note" = 'Пополнение' WHERE "note" IS NULL;--> statement-breakpoint
ALTER TABLE "top_ups" ALTER COLUMN "note" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_note_len" CHECK (char_length("top_ups"."note") between 1 and 200);