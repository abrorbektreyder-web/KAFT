-- CORE-06/07: audit jurnali o'chirilmas. Ilovada faqat INSERT va SELECT huquqi;
-- trigger admin (postgres) uchun ham UPDATE/DELETE'ni to'sadi.
-- Yagona istisno: tenant o'chirilganda FK kaskadi (PRD 10 — shartnoma tugagach 30 kunda o'chirish).
GRANT SELECT, INSERT ON audit_log TO kaft_app;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  -- pg_trigger_depth() > 1 — o'chirish tenants'dan FK kaskadi orqali kelgan
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log o''chirilmas: % taqiqlangan', TG_OP USING ERRCODE = 'P0001';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
