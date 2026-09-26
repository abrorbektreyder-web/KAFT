-- CORE-12, HR-09 (R1): RLS.
GRANT SELECT, INSERT, UPDATE ON company_profiles TO kaft_app;
--> statement-breakpoint
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE company_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON company_profiles TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staffing_plans TO kaft_app;
--> statement-breakpoint
ALTER TABLE staffing_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staffing_plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staffing_plans TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
