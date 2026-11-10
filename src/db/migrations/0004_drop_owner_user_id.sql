ALTER TABLE "categories" DROP CONSTRAINT "categories_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "categories_user_name_uniq";--> statement-breakpoint
DROP INDEX "categories_user_id_idx";--> statement-breakpoint
DROP INDEX "expenses_user_spent_idx";--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "user_id";