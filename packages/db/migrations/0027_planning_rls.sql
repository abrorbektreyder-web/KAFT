-- FIN-06/08 (R1): RLS. Rejali to'lovlar tahrirlanadi (reja, hujjat emas); kassa yopish yozuvi faqat yoziladi.
GRANT SELECT, INSERT, UPDATE ON scheduled_payments TO kaft_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON cash_closings TO kaft_app;
--> statement-breakpoint
ALTER TABLE scheduled_payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE scheduled_payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON scheduled_payments TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cash_closings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cash_closings TO kaft_app USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Mavjud tenantlarning standart moddalari: tovar xaridi (tannarx orqali) va kredit to'lovi foyda-zararga kirmaydi
UPDATE expense_categories SET in_pl = false WHERE name IN ('Tovar xaridi', 'Kredit to‘lovi');
