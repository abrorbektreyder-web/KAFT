CREATE TABLE "employment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"basis" text,
	"payload" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by" uuid
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "annual_leave_days" integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_events" ADD CONSTRAINT "employment_events_tenant_id_employee_id_employees_tenant_id_id_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employment_events_employee_idx" ON "employment_events" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "employment_events_period_idx" ON "employment_events" USING btree ("tenant_id","starts_on");