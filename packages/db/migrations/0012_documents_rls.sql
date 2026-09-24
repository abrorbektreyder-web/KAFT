GRANT SELECT, INSERT, UPDATE ON documents TO kaft_app;
--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON documents TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
