-- Every expense must belong to an account of its own space. Expenses saved
-- without one (or linked across spaces) get an account per (space, currency),
-- anchored at now() with balance 0 so the old expenses don't move it. The symbol array follows the currency_code label
-- order; a NULL slot falls back to the code itself (RSD has no sign).
LOCK TABLE "expenses" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE "expenses" e SET "account_id" = NULL
FROM "accounts" a
WHERE e."account_id" = a."id" AND a."space_id" <> e."space_id";
--> statement-breakpoint
WITH orphan AS (
	SELECT DISTINCT ON ("space_id", "currency") "space_id", "currency", "created_by"
	FROM "expenses"
	WHERE "account_id" IS NULL
	ORDER BY "space_id", "currency", "created_at", "id"
), named AS (
	SELECT o.*,
		CASE WHEN count(*) OVER (PARTITION BY o."space_id") = 1 THEN 'Основной'
		ELSE 'Основной ' || coalesce(
			(ARRAY['₽', '$', '€', NULL, '₿'])[array_position(enum_range(NULL::"currency_code"), o."currency")],
			o."currency"::text
		) END AS base
	FROM orphan o
), created AS (
	INSERT INTO "accounts" ("space_id", "created_by", "name", "currency", "anchor_amount_minor", "anchor_at")
	SELECT n."space_id", n."created_by",
		(SELECT c.candidate
			FROM (SELECT i, CASE WHEN i = 1 THEN n.base ELSE n.base || ' ' || i END AS candidate
				FROM generate_series(1, 1000) i) c
			WHERE NOT EXISTS (
				SELECT 1 FROM "accounts" a WHERE a."space_id" = n."space_id" AND a."name" = c.candidate
			)
			ORDER BY c.i
			LIMIT 1),
		n."currency", 0, now()
	FROM named n
	RETURNING "id", "space_id", "currency"
)
UPDATE "expenses" e SET "account_id" = c."id"
FROM created c
WHERE e."account_id" IS NULL AND e."space_id" = c."space_id" AND e."currency" = c."currency";
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_space_uniq" UNIQUE("id","space_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_same_space_fk" FOREIGN KEY ("account_id","space_id") REFERENCES "public"."accounts"("id","space_id") ON DELETE cascade ON UPDATE no action;
