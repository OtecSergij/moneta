ALTER TYPE "public"."currency_code" ADD VALUE 'USD';--> statement-breakpoint
ALTER TYPE "public"."currency_code" ADD VALUE 'EUR';--> statement-breakpoint
ALTER TYPE "public"."currency_code" ADD VALUE 'RSD';--> statement-breakpoint
ALTER TYPE "public"."currency_code" ADD VALUE 'BTC';--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" "currency_code" NOT NULL,
	"effective_date" date NOT NULL,
	"rate_to_usd" numeric(36, 20) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_currency_effective_date_pk" PRIMARY KEY("currency","effective_date"),
	CONSTRAINT "fx_rates_rate_positive" CHECK ("fx_rates"."rate_to_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "rate_to_usd_override" numeric(36, 20);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "rate_source" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "charged_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "charged_currency" "currency_code";--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "display_currency" "currency_code" DEFAULT 'RUB' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rate_override_pair" CHECK (("expenses"."rate_to_usd_override" is null) = ("expenses"."rate_source" is null));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_charged_pair" CHECK (("expenses"."charged_amount_minor" is null) = ("expenses"."charged_currency" is null));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_charged_amount_positive" CHECK ("expenses"."charged_amount_minor" is null or "expenses"."charged_amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rate_override_positive" CHECK ("expenses"."rate_to_usd_override" is null or "expenses"."rate_to_usd_override" > 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rate_source_values" CHECK ("expenses"."rate_source" is null or "expenses"."rate_source" in ('user', 'coinbase'));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rate_source_requires_charged" CHECK ("expenses"."rate_source" is distinct from 'user' or "expenses"."charged_amount_minor" is not null);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_charged_currency_differs" CHECK ("expenses"."charged_currency" is null or "expenses"."charged_currency" <> "expenses"."currency");