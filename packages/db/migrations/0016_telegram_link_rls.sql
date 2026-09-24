GRANT SELECT, INSERT, UPDATE ON telegram_link_codes TO kaft_app;
--> statement-breakpoint
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE telegram_link_codes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON telegram_link_codes TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Faol (ishlatilmagan) kodlar orasida takror bo'lmasin
CREATE UNIQUE INDEX telegram_link_codes_active_uq ON telegram_link_codes (code_hash) WHERE used_at IS NULL;
