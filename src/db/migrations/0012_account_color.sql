-- Existing accounts take PALETTE_COLORS (src/lib/palette.ts) in creation
-- order within each space, wrapping around past the 15th.
ALTER TABLE "accounts" ADD COLUMN "color" text;--> statement-breakpoint
WITH palette AS (
	SELECT ARRAY['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#10B981', '#14B8A6', '#06B6D4',
		'#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#A16207', '#64748B'] AS colors
), ranked AS (
	SELECT "id", (row_number() OVER (PARTITION BY "space_id" ORDER BY "created_at", "id") - 1)::int AS i
	FROM "accounts"
)
UPDATE "accounts" a SET "color" = p.colors[r.i % cardinality(p.colors) + 1]
FROM ranked r, palette p
WHERE a."id" = r."id";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_color_hex" CHECK ("accounts"."color" ~ '^#[0-9A-Fa-f]{6}$');
