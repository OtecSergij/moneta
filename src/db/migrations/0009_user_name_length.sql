UPDATE "user" SET "name" = left("name", 60) WHERE char_length("name") > 60;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_name_length" CHECK (char_length("user"."name") <= 60);