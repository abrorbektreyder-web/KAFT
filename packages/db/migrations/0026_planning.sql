CREATE TABLE "cash_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"closing_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"counted" bigint NOT NULL,
	"system" bigint NOT NULL,
	"diff" bigint NOT NULL,
	"note" text,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_closings_account_date_key" UNIQUE("tenant_id","account_id","closing_date")
);
--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"category_id" uuid,
	"counterparty_id" uuid,
	"starts_on" date NOT NULL,
	"repeat" text NOT NULL,
	"ends_on" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_payments_direction_check" CHECK ("scheduled_payments"."direction" in ('in', 'out')),
	CONSTRAINT "scheduled_payments_repeat_check" CHECK ("scheduled_payments"."repeat" in ('once', 'weekly', 'monthly')),
	CONSTRAINT "scheduled_payments_amount_check" CHECK ("scheduled_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD COLUMN "in_pl" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_tenant_id_account_id_cash_accounts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","account_id") REFERENCES "public"."cash_accounts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_tenant_id_company_id_companies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","company_id") REFERENCES "public"."companies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_tenant_id_category_id_expense_categories_tenant_id_id_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."expense_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_tenant_id_counterparty_id_counterparties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","counterparty_id") REFERENCES "public"."counterparties"("tenant_id","id") ON DELETE cascade ON UPDATE no action;