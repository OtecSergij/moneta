CREATE TYPE "public"."list_visibility" AS ENUM('shared', 'private');--> statement-breakpoint
CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"text" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_text_len" CHECK (char_length(trim("list_items"."text")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"visibility" "list_visibility" DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_id_space_uniq" UNIQUE("id","space_id"),
	CONSTRAINT "lists_name_len" CHECK (char_length(trim("lists"."name")) between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_same_space_fk" FOREIGN KEY ("list_id","space_id") REFERENCES "public"."lists"("id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_items_list_checked_created_idx" ON "list_items" USING btree ("list_id","checked","created_at");--> statement-breakpoint
CREATE INDEX "lists_space_updated_idx" ON "lists" USING btree ("space_id","updated_at" DESC NULLS LAST);