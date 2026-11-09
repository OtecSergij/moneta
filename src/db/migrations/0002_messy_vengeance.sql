ALTER TABLE "expenses" DROP CONSTRAINT "expenses_rate_override_pair";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_charged_pair";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_charged_amount_positive";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_rate_override_positive";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_rate_source_values";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_rate_source_requires_charged";--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_charged_currency_differs";--> statement-breakpoint
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_salary_days_range";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "rate_to_usd_override";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "rate_source";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "charged_amount_minor";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "charged_currency";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "salary_days";