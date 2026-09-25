CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_name" text NOT NULL,
	"changes" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	CONSTRAINT "change_requests_status_check" CHECK ("change_requests"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"number" text NOT NULL,
	"signed_on" date NOT NULL,
	"ends_on" date,
	"amount" bigint,
	"currency" char(3) DEFAULT 'UZS' NOT NULL,
	"document_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"roles" text[] NOT NULL,
	"stir" text,
	"address" text,
	"contact_person" text,
	"phone" text,
	"bank_name" text,
	"bank_mfo" text,
	"bank_account" text,
	"manager_user_id" uuid,
	"credit_limit" bigint,
	"credit_currency" char(3) DEFAULT 'UZS' NOT NULL,
	"payment_term_days" integer,
	"note" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterparties_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "counterparties_tenant_stir_key" UNIQUE("tenant_id","stir"),
	CONSTRAINT "counterparties_roles_check" CHECK (cardinality("counterparties"."roles") > 0 and "counterparties"."roles" <@ array['customer', 'wholesale', 'supplier'])
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_tenant_id_requested_by_users_tenant_id_id_fk" FOREIGN KEY ("tenant_id","requested_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_counterparty_id_counterparties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","counterparty_id") REFERENCES "public"."counterparties"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_tenant_id_manager_user_id_users_tenant_id_id_fk" FOREIGN KEY ("tenant_id","manager_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_one_pending" ON "change_requests" USING btree ("tenant_id","entity","entity_id") WHERE "change_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "contracts_ends_on_idx" ON "contracts" USING btree ("tenant_id","ends_on");--> statement-breakpoint
CREATE INDEX "counterparties_name_idx" ON "counterparties" USING btree ("tenant_id","name");--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_tenant_id_counterparty_id_counterparties_tenant_id_id_fk" FOREIGN KEY ("tenant_id","counterparty_id") REFERENCES "public"."counterparties"("tenant_id","id") ON DELETE no action ON UPDATE no action;