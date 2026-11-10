CREATE TYPE "public"."space_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "pending_space_joins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"space_id" uuid NOT NULL,
	"invite_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "space_invites_token_uniq" UNIQUE("token"),
	CONSTRAINT "space_invites_used_by_requires_used_at" CHECK ("space_invites"."used_by" is null or "space_invites"."used_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "space_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id"),
	CONSTRAINT "space_members_user_uniq" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "created_by" uuid;--> statement-breakpoint
INSERT INTO "spaces" ("id","created_at") SELECT "id","created_at" FROM "user";--> statement-breakpoint
INSERT INTO "space_members" ("space_id","user_id","role","joined_at") SELECT "id","id",'owner',"created_at" FROM "user";--> statement-breakpoint
UPDATE "categories" SET "space_id"="user_id","created_by"="user_id";--> statement-breakpoint
UPDATE "expenses" SET "space_id"="user_id","created_by"="user_id";--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "space_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "space_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_space_name_uniq" UNIQUE("space_id","name");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_id_space_uniq" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_category_id_categories_id_fk";--> statement-breakpoint
ALTER TABLE "pending_space_joins" ADD CONSTRAINT "pending_space_joins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_space_joins" ADD CONSTRAINT "pending_space_joins_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_space_joins" ADD CONSTRAINT "pending_space_joins_invite_id_space_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."space_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_invites" ADD CONSTRAINT "space_invites_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "space_invites_one_open_uniq" ON "space_invites" USING btree ("space_id") WHERE "space_invites"."used_at" is null and "space_invites"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "space_members_one_owner_uniq" ON "space_members" USING btree ("space_id") WHERE "space_members"."role" = 'owner';--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_same_space_fk" FOREIGN KEY ("category_id","space_id") REFERENCES "public"."categories"("id","space_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_space_spent_idx" ON "expenses" USING btree ("space_id","spent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_space_author_created_idx" ON "expenses" USING btree ("space_id","created_by","created_at" DESC NULLS LAST);
