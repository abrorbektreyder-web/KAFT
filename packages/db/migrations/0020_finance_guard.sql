-- FIN (R1): RLS va o'chirilmas pul hujjatlari (CORE-07). Ilovada DELETE huquqi yo'q;
-- cash_transactions'da UPDATE faqat bir marta, sababi bilan bekor qilish uchun.
GRANT SELECT, INSERT, UPDATE ON cash_accounts, expense_categories TO kaft_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON cash_transactions TO kaft_app;
--> statement-breakpoint
-- Kurslar umumiy: ilova faqat o'qiydi, tizim (admin ulanish) yozadi
GRANT SELECT ON exchange_rates TO kaft_app;
--> statement-breakpoint
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cash_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cash_accounts TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expense_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON expense_categories TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cash_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cash_transactions TO kaft_app
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cash_transactions_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- tenant/kassa kaskadi
    RAISE EXCEPTION 'pul hujjati o''chirilmaydi — bekor qiling' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'hujjat allaqachon bekor qilingan' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.tenant_id, NEW.account_id, NEW.kind, NEW.direction, NEW.amount, NEW.currency, NEW.rate, NEW.category_id,
      NEW.counterparty_id, NEW.transfer_id, NEW.occurred_on, NEW.basis, NEW.note, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.tenant_id, OLD.account_id, OLD.kind, OLD.direction, OLD.amount, OLD.currency, OLD.rate, OLD.category_id,
      OLD.counterparty_id, OLD.transfer_id, OLD.occurred_on, OLD.basis, OLD.note, OLD.created_by, OLD.created_at)
     OR NEW.cancelled_at IS NULL OR coalesce(btrim(NEW.cancel_reason), '') = '' THEN
    RAISE EXCEPTION 'pul hujjatini faqat sababi bilan bekor qilish mumkin' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER cash_transactions_immutable
  BEFORE UPDATE OR DELETE ON cash_transactions
  FOR EACH ROW EXECUTE FUNCTION cash_transactions_guard();
