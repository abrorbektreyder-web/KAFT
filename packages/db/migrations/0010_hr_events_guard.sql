-- CORE-07: kadr hodisalari o'chirilmaydi. Ilovada DELETE huquqi yo'q; UPDATE faqat bir marta bekor qilish uchun.
GRANT SELECT, INSERT, UPDATE ON employment_events TO kaft_app;
--> statement-breakpoint
ALTER TABLE employment_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employment_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON employment_events TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION employment_events_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- tenant/xodim kaskadi
    RAISE EXCEPTION 'kadr hodisasi o''chirilmaydi — bekor qiling' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'hodisa allaqachon bekor qilingan' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.tenant_id, NEW.employee_id, NEW.type, NEW.starts_on, NEW.ends_on, NEW.basis, NEW.payload, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.tenant_id, OLD.employee_id, OLD.type, OLD.starts_on, OLD.ends_on, OLD.basis, OLD.payload, OLD.created_by, OLD.created_at)
     OR NEW.cancelled_at IS NULL OR coalesce(btrim(NEW.cancel_reason), '') = '' THEN
    RAISE EXCEPTION 'kadr hodisasini faqat sababi bilan bekor qilish mumkin' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER employment_events_immutable
  BEFORE UPDATE OR DELETE ON employment_events
  FOR EACH ROW EXECUTE FUNCTION employment_events_guard();
