-- Sotuv/xarid (R1): RLS va o'zgarmas hujjatlar (CORE-07). Hujjat qatorlari faqat yoziladi;
-- hujjatda UPDATE faqat: kutilayotganini tasdiqlash (pending → posted) yoki bir marta sababi bilan bekor qilish.
GRANT SELECT, INSERT, UPDATE ON products, doc_counters TO kaft_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON sales, purchases TO kaft_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON sale_lines, purchase_lines TO kaft_app;
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON products TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE doc_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE doc_counters FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON doc_counters TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sales TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE sale_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sale_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sale_lines TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON purchases TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE purchase_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchase_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON purchase_lines TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION trade_doc_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- tenant/kontragent kaskadi
    RAISE EXCEPTION 'savdo hujjati o''chirilmaydi — bekor qiling' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'hujjat allaqachon bekor qilingan' USING ERRCODE = 'P0001';
  END IF;
  -- Hujjat mazmuni o'zgarmaydi (holat, tasdiq va bekor qilish maydonlaridan tashqari hammasi)
  IF (to_jsonb(NEW) - ARRAY['status', 'approved_by', 'approved_at', 'cancelled_at', 'cancel_reason', 'cancelled_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'approved_by', 'approved_at', 'cancelled_at', 'cancel_reason', 'cancelled_by']) THEN
    RAISE EXCEPTION 'savdo hujjatini o''zgartirib bo''lmaydi — bekor qilib qaytadan kiriting' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'pending' AND NEW.status = 'posted' AND NEW.approved_by IS NOT NULL) THEN
    RAISE EXCEPTION 'faqat kutilayotgan hujjat tasdiqlanadi' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.cancelled_at IS NOT NULL AND coalesce(btrim(NEW.cancel_reason), '') = '' THEN
    RAISE EXCEPTION 'hujjatni faqat sababi bilan bekor qilish mumkin' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sales_immutable BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION trade_doc_guard();
--> statement-breakpoint
CREATE TRIGGER purchases_immutable BEFORE UPDATE OR DELETE ON purchases FOR EACH ROW EXECUTE FUNCTION trade_doc_guard();
--> statement-breakpoint
-- Pul hujjati: yangi ustunlar (sale_id, purchase_id) ham o'zgarmas — umumiy qoida bilan qayta yoziladi
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
  IF (to_jsonb(NEW) - ARRAY['cancelled_at', 'cancel_reason', 'cancelled_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelled_at', 'cancel_reason', 'cancelled_by'])
     OR NEW.cancelled_at IS NULL OR coalesce(btrim(NEW.cancel_reason), '') = '' THEN
    RAISE EXCEPTION 'pul hujjatini faqat sababi bilan bekor qilish mumkin' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
