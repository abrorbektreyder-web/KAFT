-- Taklifnomalar — tenant ichida, RLS bilan
GRANT SELECT, INSERT, UPDATE ON invitations TO kaft_app;
--> statement-breakpoint
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitations TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Login jadvallari: faqat server (Better Auth, admin ulanish). Boshqa rollar uchun RLS
-- yoqilgan va siyosat yo'q — ya'ni hech qanday qator ochilmaydi.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_user','auth_session','auth_account','auth_verification','auth_two_factor'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
