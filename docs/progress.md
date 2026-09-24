# Kaft — bajarilish holati

Manba: `docs/prd-tz-v1.0.pdf`. Talab ID'lari PRD bilan bir xil.

Belgilar: `[x]` bajarildi · `[~]` jarayonda · `[ ]` boshlanmagan

**Hozir:** R0 · 1-hafta asosan tugadi (branch `r0/hafta-1-poydevor`). Keyingisi — 2-hafta: kirish va ruxsatlar.

---

## R0 — Yadro va kadrlar (1–6 hafta)

### 1-hafta: poydevor
- [x] Monorepo (pnpm): `packages/db`, `packages/core`, `apps/web` (Next.js 16), `apps/worker`
- [x] Baza sxemasi: tenants, companies, departments, users, roles, role_permissions, user_roles, tenant_modules
- [x] Tenant sozlamalari (brend: nom, logo, rang) va modul kalitlari — `createTenant`, `setModule`, `isModuleEnabled`
- [x] RLS siyosatlari + `withTenant()` (ilova `kaft_app` rolida, BYPASSRLS yo'q)
- [x] Tenant izolyatsiyasi testlari (AC-7) — 10/10 o'tdi
- [x] Modul kalitlari testlari — 5/5 o'tdi
- [x] Migratsiyalar (`0000_core`, `0001_rls`) — dev bazaga qo'llandi
- [~] CI (GitHub Actions) — yozildi, GitHub'ga push qilinmagani uchun hali ishga tushmagan
- [~] Dockerfile + docker-compose — yozildi, Docker yo'qligi uchun tekshirilmagan (standalone build tekshirildi)
- [ ] Staging server — provayder tanlanmagan (PRD ochiq savol #1)
- [ ] shadcn/ui — UI ishi boshlanganda (6-hafta) o'rnatiladi

### 2-hafta: kirish va ruxsatlar
- [ ] Kirish (telefon — Telegram Gateway / email), taklif qilish
- [ ] Egaga 2FA
- [ ] Ruxsatlarni tekshiruvchi qatlam
- [ ] Audit jurnali (AC-7 ning «urinish jurnalga yoziladi» qismi shu yerda)

### 3–6-hafta
- [ ] 3: Xodim kartasi, lavozim, bo'lim, maxfiy maydonlar, Excel import
- [ ] 4: Kadr hodisalari, holatni avtomatik hisoblash, kadr kalendari, ta'til qoldig'i
- [ ] 5: Hujjatlar va maxfiylik, muddat eslatmalari, Telegram bot, bildirishnomalar
- [ ] 6: Bosh sahifa v1, uz/ru, e2e testlar, asoschi mijozga ishga tushirish

### R0 talablari
- [ ] CORE-01 Tenant ro'yxatdan o'tishi va sozlash ustasi
- [ ] CORE-02 Holding tuzilmasi: kompaniyalar, ierarxik bo'limlar
- [ ] CORE-03 Foydalanuvchini taklif qilish, rol berish, bloklash
- [ ] CORE-04 Rollar va ruxsatlar (modul, amal, maxfiy maydon)
- [ ] CORE-05 Ega va moliya rollariga 2FA
- [ ] CORE-06 Audit jurnali
- [ ] CORE-07 O'chirilmas tarix
- [ ] CORE-08 O'zbek va rus interfeysi
- [ ] CORE-09 Global qidiruv
- [ ] CORE-10 Bildirishnomalar markazi
- [ ] HR-01 … HR-08 Xodim kartasi, kadr hodisalari, holat, kalendar, eslatmalar, hujjatlar
- [ ] HR-11 Xodimlarni Excel'dan import
- [ ] DOC-01/02 Fayllar va maxfiylik darajasi
- [ ] TG-01 Telegram bot: bildirishnomalar
- [ ] TG-04 Telegram akkauntni bog'lash
- [ ] INT-01 Excel shablon (xodimlar)
- [ ] Bosh sahifa v1

## R1 — Pul va kontragentlar (7–12 hafta)
- [ ] Ko'p valyutali qarz qoidasi (R1 dan oldin hal qilinadi)
- [ ] FIN-01…08, FIN-10 · CP-01…05, CP-08, CP-10 · SAL-01/02/05/07 · PUR-01/05
- [ ] INT-02…04 · CTL-05 · CORE-11/12 · HR-09 · DOC-03/04

## R2 — Operatsiya va nazorat (13–18 hafta)
- [ ] INV-01…05/07 · ATT · PAY · TSK · APR · CTL-01…04 · MGT-03 · TG-02/03
- [ ] SAL-03/04/06/08 · PUR-02/03 · CP-06/07/09 · FIN-09/11

## R3 — Boshqaruv (19–24 hafta)
- [ ] MGT-01/02/04/05/07 · FIN-12 · INV-06 · PUR-04 · HR-10

---

## Qarorlar jurnali
- 2026-09-24: Stek — Next.js, toza PostgreSQL + Drizzle, Better Auth (Supabase self-host emas).
- 2026-09-24: Telefon OTP — Telegram Gateway.
- 2026-09-24: Bitta kod bazasi, ko'p mijoz; moslashtirish tenant sozlamalari va modul kalitlari orqali.
- 2026-09-24: Dev baza — Supabase bulutida (faqat soxta ma'lumot), lokal Docker yo'q.
