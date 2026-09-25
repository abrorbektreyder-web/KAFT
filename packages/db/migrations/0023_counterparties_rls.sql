-- CP (R1): RLS. O'chirish ilovada yo'q (arxivlanadi); o'zgarishlar audit jurnalida.
GRANT SELECT, INSERT, UPDATE ON counterparties TO kaft_app;
--> statement-breakpoint
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE counterparties FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON counterparties TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON contracts TO kaft_app;
--> statement-breakpoint
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON contracts TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON change_requests TO kaft_app;
--> statement-breakpoint
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE change_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON change_requests TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
