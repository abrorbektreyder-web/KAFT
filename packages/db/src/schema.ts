// Yadro sxemasi (PRD 9.1–9.2). Har jadvalda tenant_id; ajratish RLS bilan (migrations/*_rls.sql).
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, char, foreignKey, pgTable, primaryKey, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core';

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
