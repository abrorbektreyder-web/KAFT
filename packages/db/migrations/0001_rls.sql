-- Tenant izolyatsiyasi (PRD 9.1, 11.1). Ilova har doim kaft_app rolida ishlaydi:
-- bu rolda BYPASSRLS yo'q, shuning uchun kodda xato bo'lsa ham boshqa tenant qatori ochilmaydi.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kaft_app') THEN
    CREATE ROLE kaft_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT kaft_app TO current_user;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO kaft_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant_id() TO kaft_app;
--> statement-breakpoint
-- Tenant yaratish/o'chirish — faqat tizim (admin) amali
GRANT SELECT, UPDATE ON tenants TO kaft_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_modules, companies, departments, users, roles, role_permissions, user_roles TO kaft_app;
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenants TO kaft_app
  USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_modules','companies','departments','users','roles','role_permissions','user_roles'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())', t);
  END LOOP;
END $$;
