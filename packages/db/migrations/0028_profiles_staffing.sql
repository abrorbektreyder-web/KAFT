CREATE TABLE "company_profiles" (
	"tenant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"industry" text,
	"business_model" text,
	"products" text,
	"customer_profile" text,
	"funnel" text,
	"advantage" text,
	"not_segment" text,
	"strategy" text,
	"visibility" text DEFAULT 'owner' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profiles_tenant_id_company_id_pk" PRIMARY KEY("tenant_id","company_id"),
	CONSTRAINT "company_profiles_visibility_check" CHECK ("company_profiles"."visibility" in ('owner', 'managers', 'all'))
);
--> statement-breakpoint
CREATE TABLE "staffing_plans" (
	"tenant_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"planned" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staffing_plans_tenant_id_department_id_position_id_pk" PRIMARY KEY("tenant_id","department_id","position_id"),
	CONSTRAINT "staffing_plans_planned_check" CHECK ("staffing_plans"."planned" >= 0)
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_tenant_id_company_id_companies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","company_id") REFERENCES "public"."companies"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_plans" ADD CONSTRAINT "staffing_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_plans" ADD CONSTRAINT "staffing_plans_tenant_id_department_id_departments_tenant_id_id_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_plans" ADD CONSTRAINT "staffing_plans_tenant_id_position_id_positions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","position_id") REFERENCES "public"."positions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;