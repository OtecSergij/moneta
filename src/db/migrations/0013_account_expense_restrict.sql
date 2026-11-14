ALTER TABLE "expenses" DROP CONSTRAINT "expenses_account_same_space_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_same_space_fk" FOREIGN KEY ("account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE restrict ON UPDATE no action;