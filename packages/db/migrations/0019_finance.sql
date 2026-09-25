CREATE TABLE "cash_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" char(3) NOT NULL,
	"responsible_user_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "cash_accounts_tenant_id_id_currency_key" UNIQUE("tenant_id","id","currency"),
	CONSTRAINT "cash_accounts_type_check" CHECK ("cash_accounts"."type" in ('cash', 'bank', 'card', 'payment'))
);
--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"rate" numeric(20, 6),
	"category_id" uuid,
	"counterparty_id" uuid,
	"transfer_id" uuid,
	"occurred_on" date NOT NULL,
	"basis" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid,
	CONSTRAINT "cash_transactions_amount_check" CHECK ("cash_transactions"."amount" > 0),
	CONSTRAINT "cash_transactions_direction_check" CHECK ("cash_transactions"."direction" in ('in', 'out')),
	CONSTRAINT "cash_transactions_kind_check" CHECK ("cash_transactions"."kind" in ('opening', 'income', 'expense', 'transfer'))
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"rate_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"rate" numeric(20, 6) NOT NULL,
	"source" text DEFAULT 'cbu' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_rate_date_currency_pk" PRIMARY KEY("rate_date","currency")
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_ru" text,
	"direction" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "expense_categories_name_key" UNIQUE("tenant_id","direction","name"),
	CONSTRAINT "expense_categories_direction_check" CHECK ("expense_categories"."direction" in ('in', 'out'))
);
--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_tenant_id_company_id_companies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","company_id") REFERENCES "public"."companies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_tenant_id_responsible_user_id_users_tenant_id_id_fk" FOREIGN KEY ("tenant_id","responsible_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_account_id_currency_cash_accounts_tenant_id_id_currency_fk" FOREIGN KEY ("tenant_id","account_id","currency") REFERENCES "public"."cash_accounts"("tenant_id","id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_category_id_expense_categories_tenant_id_id_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."expense_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_transactions_account_idx" ON "cash_transactions" USING btree ("tenant_id","account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "cash_transactions_transfer_idx" ON "cash_transactions" USING btree ("transfer_id");