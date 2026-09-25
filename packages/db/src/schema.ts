// Yadro sxemasi (PRD 9.1–9.2). Har jadvalda tenant_id; ajratish RLS bilan (migrations/*_rls.sql).
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, char, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { authUser } from './auth-schema.ts';

export * from './auth-schema.ts';

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const tenantId = () => uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' });

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('standard'),
  baseCurrency: char('base_currency', { length: 3 }).notNull().default('UZS'),
  timezone: text('timezone').notNull().default('Asia/Tashkent'),
  locale: text('locale').notNull().default('uz'),
  // Brend — har mijozga moslash kod o'zgarmasdan
  brandName: text('brand_name'),
  logoUrl: text('logo_url'),
  brandColor: text('brand_color'),
  createdAt: createdAt(),
});

// Modul kalitlari: qaysi modul shu tenantda yoqilgan
export const tenantModules = pgTable('tenant_modules', {
  tenantId: tenantId(),
  module: text('module').notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (t) => [primaryKey({ columns: [t.tenantId, t.module] })]);

export const companies = pgTable('companies', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** Rus tilidagi nomi (ixtiyoriy, CORE-08) */
  nameRu: text('name_ru'),
  stir: text('stir'),
  baseCurrency: char('base_currency', { length: 3 }).notNull().default('UZS'),
  createdAt: createdAt(),
}, (t) => [unique('companies_tenant_id_id_key').on(t.tenantId, t.id)]);

export const departments = pgTable('departments', {
  id: id(),
  tenantId: tenantId(),
  companyId: uuid('company_id').notNull(),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  /** Rus tilidagi nomi (ixtiyoriy, CORE-08); bo'lmasa `name` ko'rsatiladi */
  nameRu: text('name_ru'),
  createdAt: createdAt(),
}, (t) => [
  unique('departments_tenant_id_id_key').on(t.tenantId, t.id),
  // Tarkibiy FK: bo'lim faqat o'z tenantidagi kompaniya/bo'limga bog'lanadi
  foreignKey({ columns: [t.tenantId, t.companyId], foreignColumns: [companies.tenantId, companies.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.tenantId, t.parentId], foreignColumns: [t.tenantId, t.id] }),
]);

export const users = pgTable('users', {
  id: id(),
  tenantId: tenantId(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  locale: text('locale').notNull().default('uz'),
  telegramId: bigint('telegram_id', { mode: 'bigint' }),
  // Login (Better Auth) bilan bog'lanish; taklif qabul qilinguncha bo'sh
  authUserId: uuid('auth_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  isBlocked: boolean('is_blocked').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('users_tenant_id_id_key').on(t.tenantId, t.id),
  unique('users_tenant_id_email_key').on(t.tenantId, t.email),
  unique('users_tenant_id_phone_key').on(t.tenantId, t.phone),
]);

export const roles = pgTable('roles', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('roles_tenant_id_id_key').on(t.tenantId, t.id),
  unique('roles_tenant_id_name_key').on(t.tenantId, t.name),
]);

// PRD 8: modul + amal + qamrov (T/Y/K/O/L/S belgilari shu uchlikdan yig'iladi)
export const rolePermissions = pgTable('role_permissions', {
  id: id(),
  tenantId: tenantId(),
  roleId: uuid('role_id').notNull(),
  module: text('module').notNull(),
  action: text('action').notNull(),
  scope: text('scope').notNull().default('all'),
}, (t) => [
  unique('role_permissions_role_module_action_key').on(t.roleId, t.module, t.action),
  foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete('cascade'),
]);

export const userRoles = pgTable('user_roles', {
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  roleId: uuid('role_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.roleId] }),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }).onDelete('cascade'),
]);

// CORE-06: kim, qachon, nimani ko'rgan yoki o'zgartirgan. O'chirilmas (migrations/*_audit_guard.sql).
export const auditLog = pgTable('audit_log', {
  id: id(),
  tenantId: tenantId(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id'),
  // read | create | update | cancel | approve | denied | export | login
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  ip: text('ip'),
  meta: jsonb('meta'),
}, (t) => [index('audit_log_tenant_at_idx').on(t.tenantId, t.at)]);

// CORE-03: taklifnoma. Token faqat xesh ko'rinishida saqlanadi.
export const invitations = pgTable('invitations', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
]);

// HR-02: lavozimlar (kompaniya bo'yicha)
export const positions = pgTable('positions', {
  id: id(),
  tenantId: tenantId(),
  companyId: uuid('company_id').notNull(),
  name: text('name').notNull(),
  nameRu: text('name_ru'),
  createdAt: createdAt(),
}, (t) => [
  unique('positions_tenant_id_id_key').on(t.tenantId, t.id),
  unique('positions_company_name_key').on(t.companyId, t.name),
  foreignKey({ columns: [t.tenantId, t.companyId], foreignColumns: [companies.tenantId, companies.id] }).onDelete('cascade'),
]);

// HR-01/02: xodim kartasi. Maxfiy maydonlar alohida jadvalda (employee_secrets).
export const employees = pgTable('employees', {
  id: id(),
  tenantId: tenantId(),
  companyId: uuid('company_id').notNull(),
  departmentId: uuid('department_id'),
  positionId: uuid('position_id'),
  managerId: uuid('manager_id'),
  userId: uuid('user_id'),
  lastName: text('last_name').notNull(),
  firstName: text('first_name').notNull(),
  middleName: text('middle_name'),
  birthDate: date('birth_date'),
  phone: text('phone'),
  address: text('address'),
  photoUrl: text('photo_url'),
  education: text('education'),
  workSchedule: text('work_schedule'),
  contractType: text('contract_type'),
  hiredAt: date('hired_at'),
  // HR-06: yillik ta'til (kalendar kun). Mehnat kodeksi bo'yicha minimum 21
  annualLeaveDays: integer('annual_leave_days').notNull().default(21),
  // HR-07: muddat eslatmalari uchun
  probationEndsOn: date('probation_ends_on'),
  contractEndsOn: date('contract_ends_on'),
  passportExpiresOn: date('passport_expires_on'),
  createdAt: createdAt(),
}, (t) => [
  unique('employees_tenant_id_id_key').on(t.tenantId, t.id),
  foreignKey({ columns: [t.tenantId, t.companyId], foreignColumns: [companies.tenantId, companies.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.tenantId, t.departmentId], foreignColumns: [departments.tenantId, departments.id] }),
  foreignKey({ columns: [t.tenantId, t.positionId], foreignColumns: [positions.tenantId, positions.id] }),
  foreignKey({ columns: [t.tenantId, t.managerId], foreignColumns: [t.tenantId, t.id] }),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }),
  index('employees_tenant_company_idx').on(t.tenantId, t.companyId),
]);

export const employeeSecrets = pgTable('employee_secrets', {
  tenantId: tenantId(),
  employeeId: uuid('employee_id').notNull(),
  passport: text('passport'),
  jshshir: text('jshshir'),
  bankCard: text('bank_card'),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.employeeId] }),
  unique('employee_secrets_tenant_jshshir_key').on(t.tenantId, t.jshshir),
  foreignKey({ columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete('cascade'),
]);

// HR-03: kadr hodisalari. O'chirilmaydi — faqat sababi bilan bekor qilinadi (CORE-07, migrations/*_hr_events_guard.sql)
export const employmentEvents = pgTable('employment_events', {
  id: id(),
  tenantId: tenantId(),
  employeeId: uuid('employee_id').notNull(),
  // hire | transfer | position_change | salary_change | vacation | maternity | sick | business_trip | termination
  type: text('type').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  /** Asos hujjat: buyruq raqami, ariza, kasallik varaqasi */
  basis: text('basis'),
  payload: jsonb('payload'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  cancelledBy: uuid('cancelled_by'),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete('cascade'),
  index('employment_events_employee_idx').on(t.tenantId, t.employeeId),
  index('employment_events_period_idx').on(t.tenantId, t.startsOn),
]);

// DOC-01/02: hujjatlar. Fayl omborida `{tenant_id}/{id}` kaliti bilan saqlanadi.
export const documents = pgTable('documents', {
  id: id(),
  tenantId: tenantId(),
  // employee | counterparty | company
  ownerType: text('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  /** Bo'lim darajasidagi hujjat uchun (xodim hujjatida — xodimning bo'limi) */
  departmentId: uuid('department_id'),
  title: text('title').notNull(),
  // contract | order | copy | regulation | other
  kind: text('kind').notNull(),
  // open | department | secret
  confidentiality: text('confidentiality').notNull(),
  storageKey: text('storage_key').notNull(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  expiresOn: date('expires_on'),
  uploadedBy: uuid('uploaded_by'),
  createdAt: createdAt(),
}, (t) => [index('documents_owner_idx').on(t.tenantId, t.ownerType, t.ownerId)]);

// CORE-10: bildirishnomalar markazi. dedupe_key — bir eslatma bir marta (kunlik ish qayta ishlasa ham).
export const notifications = pgTable('notifications', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  /** Matn qiymatlari (ism, sana) — matn ko'rsatishda o'quvchi tilida yig'iladi; title/body — o'zbekcha nusxa */
  params: jsonb('params'),
  dedupeKey: text('dedupe_key').notNull(),
  createdAt: createdAt(),
  readAt: timestamp('read_at', { withTimezone: true }),
  /** Telegram'ga yuborilishi kerakmi (foydalanuvchi sozlamasi bo'yicha) va qachon yuborildi */
  viaTelegram: boolean('via_telegram').notNull().default(true),
  telegramSentAt: timestamp('telegram_sent_at', { withTimezone: true }),
}, (t) => [
  unique('notifications_dedupe_key').on(t.tenantId, t.userId, t.dedupeKey),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
  index('notifications_pending_tg_idx').on(t.telegramSentAt),
]);

// CORE-10: turlari bo'yicha sozlash (yozuv yo'q — hammasi yoqiq)
export const notificationPrefs = pgTable('notification_prefs', {
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  inApp: boolean('in_app').notNull().default(true),
  telegram: boolean('telegram').notNull().default(true),
}, (t) => [
  primaryKey({ columns: [t.userId, t.kind] }),
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
]);

// TG-04: Telegram bog'lash kodi. Kod faqat xesh holida; 10 daqiqa, bir marta.
export const telegramLinkCodes = pgTable('telegram_link_codes', {
  id: id(),
  tenantId: tenantId(),
  userId: uuid('user_id').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
  index('telegram_link_codes_hash_idx').on(t.codeHash),
]);

// ---------------------------------------------------------------- Kontragentlar (CP, R1)

// CP-01/02/05: yagona kontragent kartasi — butun tenant (holding) uchun umumiy; bir kontragentda bir nechta rol.
export const counterparties = pgTable('counterparties', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  /** customer (mijoz) | wholesale (ulgurji hamkor) | supplier (ta'minotchi) */
  roles: text('roles').array().notNull(),
  stir: text('stir'),
  address: text('address'),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  bankName: text('bank_name'),
  bankMfo: text('bank_mfo'),
  bankAccount: text('bank_account'),
  /** Mas'ul menejer — savdo menejerining «faqat o'ziniki» qamrovi shu bo'yicha */
  managerUserId: uuid('manager_user_id'),
  /** Kredit limiti tiyin/sentda; limitdan oshsa sotuv tasdiq bilan (SAL, 9-hafta) */
  creditLimit: bigint('credit_limit', { mode: 'number' }),
  creditCurrency: char('credit_currency', { length: 3 }).notNull().default('UZS'),
  paymentTermDays: integer('payment_term_days'),
  note: text('note'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('counterparties_tenant_id_id_key').on(t.tenantId, t.id),
  unique('counterparties_tenant_stir_key').on(t.tenantId, t.stir),
  foreignKey({ columns: [t.tenantId, t.managerUserId], foreignColumns: [users.tenantId, users.id] }),
  check('counterparties_roles_check', sql`cardinality(${t.roles}) > 0 and ${t.roles} <@ array['customer', 'wholesale', 'supplier']`),
  index('counterparties_name_idx').on(t.tenantId, t.name),
]);

// CP-08: shartnomalar. Fayl — documents (owner_type = counterparty) orqali.
export const contracts = pgTable('contracts', {
  id: id(),
  tenantId: tenantId(),
  counterpartyId: uuid('counterparty_id').notNull(),
  number: text('number').notNull(),
  signedOn: date('signed_on').notNull(),
  endsOn: date('ends_on'),
  amount: bigint('amount', { mode: 'number' }),
  currency: char('currency', { length: 3 }).notNull().default('UZS'),
  documentId: uuid('document_id'),
  note: text('note'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
}, (t) => [
  unique('contracts_tenant_id_id_key').on(t.tenantId, t.id),
  foreignKey({ columns: [t.tenantId, t.counterpartyId], foreignColumns: [counterparties.tenantId, counterparties.id] }).onDelete('cascade'),
  index('contracts_ends_on_idx').on(t.tenantId, t.endsOn),
]);

// Tasdiqlash huquqi yo'q foydalanuvchining tahriri — ega tasdiqlagach kuchga kiradi (egasi qarori, 2026-09-25).
export const changeRequests = pgTable('change_requests', {
  id: id(),
  tenantId: tenantId(),
  // counterparty | contract
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  /** Ko'rsatish uchun nom (so'rov paytidagi) */
  entityName: text('entity_name').notNull(),
  /** { maydon: { from, to } } — faqat haqiqatan o'zgargan maydonlar */
  changes: jsonb('changes').notNull(),
  // pending | approved | rejected
  status: text('status').notNull().default('pending'),
  requestedBy: uuid('requested_by').notNull(),
  requestedAt: createdAt(),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.requestedBy], foreignColumns: [users.tenantId, users.id] }).onDelete('cascade'),
  // Bir obyekt bo'yicha bir vaqtda bitta kutilayotgan so'rov
  uniqueIndex('change_requests_one_pending').on(t.tenantId, t.entity, t.entityId).where(sql`${t.status} = 'pending'`),
  check('change_requests_status_check', sql`${t.status} in ('pending', 'approved', 'rejected')`),
]);

// ---------------------------------------------------------------- Pul (FIN, R1)

// FIN-01: kassalar va hisoblar. Valyuta keyin o'zgarmaydi — operatsiyalar (tenant_id, id, currency) ga bog'langan.
export const cashAccounts = pgTable('cash_accounts', {
  id: id(),
  tenantId: tenantId(),
  companyId: uuid('company_id').notNull(),
  name: text('name').notNull(),
  // cash | bank | card | payment (Payme, Click …)
  type: text('type').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  /** Mas'ul (kassir) — «faqat o'ziniki» qamrovi shu bo'yicha */
  responsibleUserId: uuid('responsible_user_id'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('cash_accounts_tenant_id_id_key').on(t.tenantId, t.id),
  unique('cash_accounts_tenant_id_id_currency_key').on(t.tenantId, t.id, t.currency),
  foreignKey({ columns: [t.tenantId, t.companyId], foreignColumns: [companies.tenantId, companies.id] }).onDelete('cascade'),
  foreignKey({ columns: [t.tenantId, t.responsibleUserId], foreignColumns: [users.tenantId, users.id] }),
  check('cash_accounts_type_check', sql`${t.type} in ('cash', 'bank', 'card', 'payment')`),
]);

// Kirim/chiqim moddalari (xarajat turi). Byudjet va limit — R2 (FIN-09).
export const expenseCategories = pgTable('expense_categories', {
  id: id(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  nameRu: text('name_ru'),
  // in | out
  direction: text('direction').notNull(),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [
  unique('expense_categories_tenant_id_id_key').on(t.tenantId, t.id),
  unique('expense_categories_name_key').on(t.tenantId, t.direction, t.name),
  check('expense_categories_direction_check', sql`${t.direction} in ('in', 'out')`),
]);

// FIN-02: kirim va chiqim; o'tkazma/ayirboshlash — transfer_id bilan bog'langan ikki yozuv.
// O'chirilmaydi, o'zgartirilmaydi — faqat sababi bilan bekor qilinadi (CORE-07, migrations/*_finance_guard.sql).
export const cashTransactions = pgTable('cash_transactions', {
  id: id(),
  tenantId: tenantId(),
  accountId: uuid('account_id').notNull(),
  // opening | income | expense | transfer
  kind: text('kind').notNull(),
  // in | out
  direction: text('direction').notNull(),
  /** Tiyin/sentda, har doim musbat (PRD 9.1) */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  /** Operatsiya kursi: 1 birlik = N so'm. Standart — Markaziy bank, qo'lda o'zgartirish mumkin (FIN-03) */
  rate: numeric('rate', { precision: 20, scale: 6 }),
  categoryId: uuid('category_id'),
  /** Kontragent (CP-03: kartada to'lovlar) */
  counterpartyId: uuid('counterparty_id'),
  transferId: uuid('transfer_id'),
  occurredOn: date('occurred_on').notNull(),
  /** Asos hujjat: chek, to'lov topshiriqnomasi, shartnoma */
  basis: text('basis'),
  note: text('note'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  cancelledBy: uuid('cancelled_by'),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.accountId, t.currency], foreignColumns: [cashAccounts.tenantId, cashAccounts.id, cashAccounts.currency] }).onDelete('cascade'),
  foreignKey({ columns: [t.tenantId, t.categoryId], foreignColumns: [expenseCategories.tenantId, expenseCategories.id] }),
  foreignKey({ columns: [t.tenantId, t.counterpartyId], foreignColumns: [counterparties.tenantId, counterparties.id] }),
  check('cash_transactions_amount_check', sql`${t.amount} > 0`),
  check('cash_transactions_direction_check', sql`${t.direction} in ('in', 'out')`),
  check('cash_transactions_kind_check', sql`${t.kind} in ('opening', 'income', 'expense', 'transfer')`),
  index('cash_transactions_account_idx').on(t.tenantId, t.accountId, t.occurredOn),
  index('cash_transactions_transfer_idx').on(t.transferId),
]);

// FIN-03: Markaziy bank kurslari — hamma mijozlar uchun umumiy ma'lumot (tenant_id yo'q), faqat tizim yozadi.
export const exchangeRates = pgTable('exchange_rates', {
  rateDate: date('rate_date').notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  /** 1 birlik = N so'm */
  rate: numeric('rate', { precision: 20, scale: 6 }).notNull(),
  source: text('source').notNull().default('cbu'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.rateDate, t.currency] })]);

