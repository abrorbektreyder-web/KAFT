# Kaft — bajarilish holati

Manba: `docs/prd-tz-v1.0.pdf`. Talab ID'lari PRD bilan bir xil.

Belgilar: `[x]` bajarildi · `[~]` jarayonda · `[ ]` boshlanmagan

**Hozir:** R0 · 4-hafta (branch `r0/hafta-4-kadr-hodisalari`). Kadr hodisalari, holat, kalendar, ta'til qoldig'i tayyor. Keyingisi — 5-hafta (hujjatlar, eslatmalar, Telegram bot). Telefon orqali kirish Telegram Gateway tokenini kutyapti.

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
- [x] CI (GitHub Actions) — GitHub'da o'tdi: migratsiya, typecheck, testlar (toza Postgres 17 da)
- [~] Dockerfile + docker-compose — yozildi, Docker yo'qligi uchun tekshirilmagan (standalone build tekshirildi)
- [ ] Staging server — provayder tanlanmagan (PRD ochiq savol #1)
- [ ] shadcn/ui — UI ishi boshlanganda (6-hafta) o'rnatiladi

### 2-hafta: kirish va ruxsatlar
- [x] Email + parol bilan kirish (Better Auth 1.7.5), sessiya 12 soat — faol bo'lmasa tugaydi
- [x] Taklif qilish: xat + 7 kunlik bir martalik havola (token faqat xesh holida saqlanadi); audit jurnaliga yoziladi
- [x] Ega va Buxgalterga 2FA (TOTP) majburiy — yoqilmaguncha platforma ochilmaydi
- [x] Bloklangan foydalanuvchi sessiyasi ishlamaydi
- [x] Email: konsolga chiqadi + `report()` hisoboti (haqiqiy provayder keyin)
- [ ] Telefon orqali kirish — Telegram Gateway tokeni kutilmoqda
- [ ] Kirish sahifalari (UI) — 6-haftada bosh sahifa bilan
- [x] Ruxsatlarni tekshiruvchi qatlam — `authorize()`, PRD 8 matritsasi 9 ta tizim roli bilan; 10/10 test
- [x] Ruxsatsiz amal bloklanadi va audit jurnaliga yoziladi (AC-4)
- [x] Audit jurnali — o'chirilmas (ilova ham, admin ham o'zgartira/o'chira olmaydi); 6/6 test

### 3–6-hafta
- [x] 3: Xodim kartasi, lavozim, bo'lim — 7/7 test
- [x] 3: Maxfiy maydonlar (pasport, JShShIR, karta) — faqat ruxsatli rolga; har o'qish jurnalga, o'zgarish niqoblangan holda
- [x] 3: Excel import — 100 xodim 11,4 soniyada (mezon 60 s); xato bo'lsa qator/ustun, hech narsa yozilmaydi — 6/6 test
- [x] 4: Kadr hodisalari — sana va asos hujjat bilan; ustma-ust oraliq va bo'shagandan keyingi hodisa rad etiladi
- [x] 4: Holat avtomatik (ishda/ta'tilda/dikretda/kasal/safarda/bo'shagan) — AC-3 testlangan
- [x] 4: Kadr kalendari + bo'limda ko'p odam yo'qligi ogohlantirishi (standart: 30% va ≥2 kishi — PRD'da chegara yo'q)
- [x] 4: Ta'til qoldig'i — ish yili bo'yicha, standart 21 kalendar kun
- [x] 4: Hodisalar o'chirilmaydi, faqat sababi bilan bekor qilinadi (trigger bilan himoyalangan)
- [ ] 4: Kelajak sanali o'tkazishni kuni kelganda kartaga qo'llash — worker bilan (5-hafta)
- [ ] 5: Hujjatlar va maxfiylik, muddat eslatmalari, Telegram bot, bildirishnomalar
- [ ] 6: Bosh sahifa v1, uz/ru, e2e testlar, asoschi mijozga ishga tushirish

### R0 talablari
- [ ] CORE-01 Tenant ro'yxatdan o'tishi va sozlash ustasi
- [ ] CORE-02 Holding tuzilmasi: kompaniyalar, ierarxik bo'limlar
- [~] CORE-03 Taklif qilish (email), rol berish, bloklash — tayyor; telefon orqali taklif — Telegram Gateway bilan
- [~] CORE-04 Rollar va ruxsatlar — modul/amal/qamrov tayyor; ega o'z rolini yaratish UI'si va maxfiy maydon darajasi keyin
- [x] CORE-05 Ega va moliya rollariga 2FA — majburiy, testlangan
- [~] CORE-06 Audit jurnali — jadval va himoya tayyor; maxfiy maydonni o'qishni yozish HR moduli bilan (3-hafta)
- [~] CORE-07 O'chirilmas tarix — audit jurnali va kadr hodisalari himoyalangan; moliya/ombor hujjatlari R1–R2 da
- [ ] CORE-08 O'zbek va rus interfeysi
- [ ] CORE-09 Global qidiruv
- [ ] CORE-10 Bildirishnomalar markazi
- [x] HR-01 Xodim kartasi (maxfiy maydonlar bilan)
- [x] HR-02 Lavozim, bo'lim, rahbar, ish jadvali, shartnoma turi
- [x] HR-03 Kadr hodisalari
- [x] HR-04 Xodim holati avtomatik
- [x] HR-05 Kadr kalendari va ogohlantirish
- [x] HR-06 Ta'til qoldig'i
- [ ] HR-07 Muddat eslatmalari (5-hafta)
- [ ] HR-08 Xodim hujjatlari (5-hafta)
- [x] HR-11 Xodimlarni Excel'dan import (xatolarni ko'rsatish bilan)
- [ ] DOC-01/02 Fayllar va maxfiylik darajasi
- [ ] TG-01 Telegram bot: bildirishnomalar
- [ ] TG-04 Telegram akkauntni bog'lash
- [x] INT-01 Excel shablon (xodimlar)
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
- 2026-09-24: Web kirish — email + parol + TOTP 2FA; telefon (Telegram Gateway) xodimlar uchun keyin.
- 2026-09-24: Email — hozircha konsol + hisobot; provayder tanlanmagan.
