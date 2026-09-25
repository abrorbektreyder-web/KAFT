# Kaft — bajarilish holati

Manba: `docs/prd-tz-v1.0.pdf`. Talab ID'lari PRD bilan bir xil.

Belgilar: `[x]` bajarildi · `[~]` jarayonda · `[ ]` boshlanmagan

**Hozir:** R1 · 7-hafta boshlandi (branch `r1/hafta-7-kassalar`). R0 (1–6 hafta) yakunlandi; undan qolgani — asoschi mijozga ishga tushirish (server tanlanganda). Kutilmoqda: Telegram bot tokeni, Telegram Gateway tokeni, server provayderi, ko'p valyutali qarz qoidasi (9-haftagacha).

---

## R0 — Yadro va kadrlar (1–6 hafta) ✅ yakunlandi

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
- [x] 4: Kelajak sanali o'tkazishni kuni kelganda kartaga qo'llash — worker (5-hafta)
- [x] 5: Hujjatlar va maxfiylik darajasi (ochiq/bo'lim/maxfiy) — 8/8 test; fayllar hozircha lokal papkada (`LocalDiskStorage`), S3 versiyasi server tanlanganda
- [x] 5: Muddat eslatmalari — tug'ilgan kun, sinov (7 kun oldin), shartnoma va pasport (30 kun oldin); matnda maxfiy ma'lumot yo'q
- [x] 5: Bildirishnomalar markazi — platformada + Telegram, turlari bo'yicha sozlanadi; takror yuborilmaydi
- [x] 5: Telegram bog'lash — 6 xonali bir martalik kod (10 daqiqa) — 5/5 test
- [x] 5: Worker — pg-boss har kuni 08:00 (Toshkent), grammY bot; kelajak sanali o'tkazish kuni kelganda qo'llanadi
- [x] 5: Mezon «eslatma Telegram'ga belgilangan kunda keladi» — test bilan tasdiqlangan (soxta Telegram)
- [ ] 5: Haqiqiy Telegram bot bilan tekshirish — bot tokeni kutilmoqda
- [ ] 5: Ta'til qoldig'i eslatmasi (HR-07 ning bir qismi) — keyin
- [x] 6: shadcn/ui (Radix, lucide) + Kaft palitrasi (dizayn: `docs/design/`)
- [x] 6: Kirish sahifalari — login, 2FA kodi, 2FA sozlash (zaxira kodlar bilan), taklifni qabul qilish
- [x] 6: Ilova qobig'i — yon panel (modullar reliz belgisi bilan), kompaniya almashtirgich, qidiruv, bildirishnomalar, chiqish
- [x] 6: Bosh sahifa v1 — haqiqiy: «Kim qayerda», bugun yo'qlar, kadr ogohlantirishlari, eslatmalar; qolgan bloklar R1/R2 belgisi bilan (soxta raqamsiz)
- [x] 6: Global qidiruv (CORE-09) — xodim va hujjatlar
- [x] 6: Demo ma'lumot — `pnpm seed:demo` (2 kompaniya, 40 xodim, hodisalar, ega va HR loginlari)
- [x] 6: O'zbek va rus interfeysi (CORE-08) — next-intl, tanlov cookie'da va profilda saqlanadi; eslatma/Telegram matnlari o'quvchi tilida; kompaniya, bo'lim va lavozimga ixtiyoriy ruscha nom (import ustuni — bo'lim/lavozim)
- [x] 6: Tungi va kunduzgi mavzu — tanlov saqlanadi, birinchi ochilishda tizim sozlamasi
- [x] 6: e2e testlar (Playwright) — 8 ta oqim × kompyuter va telefon = 16/16; CI'ga qo'shildi
- [ ] 6: Asoschi mijozga ishga tushirish — server kerak (PRD ochiq savol #1); server tanlanganda R1 davomida

### R0 talablari
- [ ] CORE-01 Tenant ro'yxatdan o'tishi va sozlash ustasi
- [ ] CORE-02 Holding tuzilmasi: kompaniyalar, ierarxik bo'limlar
- [~] CORE-03 Taklif qilish (email), rol berish, bloklash — tayyor; telefon orqali taklif — Telegram Gateway bilan
- [~] CORE-04 Rollar va ruxsatlar — modul/amal/qamrov tayyor; ega o'z rolini yaratish UI'si va maxfiy maydon darajasi keyin
- [x] CORE-05 Ega va moliya rollariga 2FA — majburiy, testlangan
  - ⚠ Dev'da vaqtincha o'chirilgan (`KAFT_REQUIRE_2FA=false`). **Prod'ga chiqishdan oldin olib tashlash shart** — standart holatda yoqiq
- [~] CORE-06 Audit jurnali — jadval va himoya tayyor; maxfiy maydonni o'qishni yozish HR moduli bilan (3-hafta)
- [~] CORE-07 O'chirilmas tarix — audit jurnali va kadr hodisalari himoyalangan; moliya/ombor hujjatlari R1–R2 da
- [x] CORE-08 O'zbek va rus interfeysi
- [x] CORE-09 Global qidiruv (xodim, hujjat; kontragent/tovar — o'z modullari bilan)
- [x] CORE-10 Bildirishnomalar markazi (UI — 6-hafta)
- [x] HR-01 Xodim kartasi (maxfiy maydonlar bilan)
- [x] HR-02 Lavozim, bo'lim, rahbar, ish jadvali, shartnoma turi
- [x] HR-03 Kadr hodisalari
- [x] HR-04 Xodim holati avtomatik
- [x] HR-05 Kadr kalendari va ogohlantirish
- [x] HR-06 Ta'til qoldig'i
- [~] HR-07 Muddat eslatmalari — tug'ilgan kun, sinov, shartnoma, pasport tayyor; ta'til qoldig'i eslatmasi qolgan
- [x] HR-08 Xodim hujjatlari
- [x] HR-11 Xodimlarni Excel'dan import (xatolarni ko'rsatish bilan)
- [x] DOC-01/02 Fayllar va maxfiylik darajasi
- [~] TG-01 Telegram bot: bildirishnomalar — kod tayyor, haqiqiy token bilan tekshirilmagan
- [x] TG-04 Telegram akkauntni bog'lash
- [x] INT-01 Excel shablon (xodimlar)
- [x] Bosh sahifa v1 (UI)

## R1 — Pul va kontragentlar (7–12 hafta)

Haftalik reja (PRD'da R1 bo'yicha haftalik bo'linish yo'q — 2026-09-25 da kelishilgan):
7 — kassalar, kirim/chiqim, kurslar, qoldiq · 8 — kontragentlar · 9 — sotuv/xarid va qarzlar · 10 — to'lov kalendari, kassa uzilishi prognozi, kassa yopish, foyda-zarar · 11 — telefon taklifi, shtat jadvali, hujjat eslatmalari/qidiruvi, bosh sahifa pul bloki · 12 — amoCRM/Bitrix24, e2e, barqarorlashtirish

### 7-hafta: kassalar va pul
- [x] FIN-01 Kassalar va hisoblar: naqd, bank, karta, to'lov tizimi (Payme/Click); valyuta va mas'ul; boshlang'ich qoldiq
- [x] FIN-02 Kirim va chiqim: summa, valyuta, modda, kompaniya (kassa orqali), asos hujjat; kontragent maydoni (bog'lanish — 8-hafta)
- [x] Kirim/chiqim moddalari — standart ro'yxat (uz/ru) + o'z moddasi; byudjet va limit — R2 (FIN-09)
- [x] Kassalararo o'tkazma va valyuta ayirboshlash (PRD'da R2, qoldiq to'g'ri bo'lishi uchun 7-haftaga olindi)
- [x] FIN-03 / INT-02 Markaziy bank kursi — worker har kuni 08:00 yuklaydi (cbu.uz); operatsiya kursi qo'lda o'zgartiriladi
- [x] FIN-04 Pul qoldig'i real vaqtda: har kassa, kompaniya va jami — so'mda va $ ekvivalentida; kurs yo'q bo'lsa ogohlantirish
- [x] Pul hujjatlari o'chirilmaydi/o'zgartirilmaydi — faqat sababi bilan bekor qilinadi (trigger); o'tkazma ikkala tomoni bilan bekor bo'ladi
- [x] Ruxsatlar PRD 8 bo'yicha: kassir — faqat o'z kassasi, direktor — ko'radi, buxgalter — kiritadi (bekor qila olmaydi), bekor qilish — ega
- [x] «Pul» sahifasi: jami va kompaniyalar, kassalar jadvali, oxirgi operatsiyalar, kirim/chiqim/o'tkazma/kassa ochish formalari (uz/ru)
- [x] Demo ma'lumot: 7 kassa, 3 haftalik tushum va xarajatlar, inkassatsiya, dollar sotish

### R1 talablari
- [ ] Ko'p valyutali qarz qoidasi (9-haftagacha hal qilinadi)
- [~] FIN-01…08, FIN-10 — 01…04 tayyor (7-hafta) · CP-01…05, CP-08, CP-10 · SAL-01/02/05/07 · PUR-01/05
- [~] INT-02 tayyor · INT-03/04 · CTL-05 · CORE-11/12 · HR-09 · DOC-03/04

## R2 — Operatsiya va nazorat (13–18 hafta)
- [ ] INV-01…05/07 · ATT · PAY · TSK · APR · CTL-01…04 · MGT-03 · TG-02/03
- [ ] SAL-03/04/06/08 · PUR-02/03 · CP-06/07/09 · FIN-09/11

## R3 — Boshqaruv (19–24 hafta)
- [ ] MGT-01/02/04/05/07 · FIN-12 · INV-06 · PUR-04 · HR-10

---

## Qarorlar jurnali
- 2026-09-24: Stek — Next.js, toza PostgreSQL + Drizzle, Better Auth (Supabase self-host emas).
- 2026-09-24: Telefon OTP — Telegram Gateway.
- 2026-09-25: Valyutalar — UZS, USD, EUR, RUB. Summalar tiyin/sentda (bigint), kurs `numeric(20,6)`, hisob BigInt bilan (kasr xatosiz).
- 2026-09-25: Markaziy bank kurslari (`exchange_rates`) — hamma mijozlarga umumiy ma'lumot, tenant_id yo'q; ilova faqat o'qiydi, worker yozadi.
- 2026-09-25: Kassir o'tkazmani faqat o'z kassasidan qiladi (masalan, inkassatsiya); qabul qiluvchi kassa ixtiyoriy.
- 2026-09-24: Bitta kod bazasi, ko'p mijoz; moslashtirish tenant sozlamalari va modul kalitlari orqali.
- 2026-09-24: Dev baza — Supabase bulutida (faqat soxta ma'lumot), lokal Docker yo'q.
- 2026-09-24: Web kirish — email + parol + TOTP 2FA; telefon (Telegram Gateway) xodimlar uchun keyin.
- 2026-09-24: Email — hozircha konsol + hisobot; provayder tanlanmagan.
- 2026-09-25: Test davrida 2FA majburiyligi dev'da o'chirildi (`KAFT_REQUIRE_2FA=false`); prod'da yoqiq.
