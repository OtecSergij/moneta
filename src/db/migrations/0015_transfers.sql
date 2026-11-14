CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"from_account_id" uuid,
	"to_account_id" uuid,
	"from_amount_minor" bigint NOT NULL,
	"to_amount_minor" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"entered_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_amounts_positive" CHECK ("transfers"."from_amount_minor" > 0 and "transfers"."to_amount_minor" > 0),
	CONSTRAINT "transfers_distinct_accounts" CHECK ("transfers"."from_account_id" <> "transfers"."to_account_id")
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_same_space_fk" FOREIGN KEY ("from_account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE SET NULL ("from_account_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_same_space_fk" FOREIGN KEY ("to_account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE SET NULL ("to_account_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_from_created_idx" ON "transfers" USING btree ("from_account_id","created_at");--> statement-breakpoint
CREATE INDEX "transfers_to_created_idx" ON "transfers" USING btree ("to_account_id","created_at");