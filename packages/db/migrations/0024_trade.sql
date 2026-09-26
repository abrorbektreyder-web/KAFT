CREATE TABLE "doc_counters" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "doc_counters_tenant_id_kind_pk" PRIMARY KEY("tenant_id","kind")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"unit" text NOT NULL,
	"price_retail" bigint,
	"price_wholesale" bigint,
	"price_special" bigint,
	"currency" char(3) DEFAULT 'UZS' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_tenant_sku_key" UNIQUE("tenant_id","sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(18, 3) NOT NULL,
	"price" bigint NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "purchase_lines_qty_check" CHECK ("purchase_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"company_id" uuid,
	"counterparty_id" uuid NOT NULL,
	"doc_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"total" bigint NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"manager_user_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"kind" text NOT NULL,
	CONSTRAINT "purchases_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "purchases_tenant_number_key" UNIQUE("tenant_id","number"),
	CONSTRAINT "purchases_kind_check" CHECK ("purchases"."kind" in ('purchase', 'opening')),
	CONSTRAINT "purchases_status_check" CHECK ("purchases"."status" in ('posted', 'pending')),
	CONSTRAINT "purchases_total_check" CHECK ("purchases"."total" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" numeric(18, 3) NOT NULL,
	"price" bigint NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "sale_lines_qty_check" CHECK ("sale_lines"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"company_id" uuid,
	"counterparty_id" uuid NOT NULL,
	"doc_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"total" bigint NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"manager_user_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"kind" text NOT NULL,
	"return_of_id" uuid,
	"price_type" text,
	CONSTRAINT "sales_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "sales_tenant_number_key" UNIQUE("tenant_id","number"),
	CONSTRAINT "sales_kind_check" CHECK ("sales"."kind" in ('sale', 'return', 'opening')),
	CONSTRAINT "sales_status_check" CHECK ("sales"."status" in ('posted', 'pending')),
	CONSTRAINT "sales_total_check" CHECK ("sales"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD COLUMN "sale_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD COLUMN "purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "doc_counters" ADD CONSTRAINT "doc_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_tenant_id_purchase_id_purchases_tenant_id_id_fk" FOREIGN KEY ("tenant_id","purchase_id") REFERENCES "public"."purchases"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_tenant_id_product_id_products_tenant_id_id_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_counterparty_id_counterparties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","counterparty_id") REFERENCES "public"."counterparties"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_company_id_companies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","company_id") REFERENCES "public"."companies"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_tenant_id_sale_id_sales_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sale_id") REFERENCES "public"."sales"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_tenant_id_product_id_products_tenant_id_id_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_counterparty_id_counterparties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","counterparty_id") REFERENCES "public"."counterparties"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_company_id_companies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","company_id") REFERENCES "public"."companies"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_return_of_id_sales_tenant_id_id_fk" FOREIGN KEY ("tenant_id","return_of_id") REFERENCES "public"."sales"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_idx" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchases_counterparty_idx" ON "purchases" USING btree ("tenant_id","counterparty_id","doc_date");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_counterparty_idx" ON "sales" USING btree ("tenant_id","counterparty_id","doc_date");--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_sale_id_sales_tenant_id_id_fk" FOREIGN KEY ("tenant_id","sale_id") REFERENCES "public"."sales"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_purchase_id_purchases_tenant_id_id_fk" FOREIGN KEY ("tenant_id","purchase_id") REFERENCES "public"."purchases"("tenant_id","id") ON DELETE no action ON UPDATE no action;