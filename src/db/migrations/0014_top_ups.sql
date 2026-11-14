CREATE TABLE "top_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"note" text,
	"occurred_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "top_ups_amount_positive" CHECK ("top_ups"."amount_minor" > 0),
	CONSTRAINT "top_ups_note_len" CHECK ("top_ups"."note" is null or char_length("top_ups"."note") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "top_ups" ADD CONSTRAINT "top_ups_account_same_space_fk" FOREIGN KEY ("account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "top_ups_account_created_idx" ON "top_ups" USING btree ("account_id","created_at");