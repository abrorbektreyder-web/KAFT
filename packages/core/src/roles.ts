// PRD 8: rollar va ruxsatlar matritsasi — har yangi tenantga standart shablon sifatida yoziladi.
// Ega keyin o'z rollarini yarata oladi (CORE-04).
import type { ModuleKey } from './tenants.ts';

export type Action = 'view' | 'create' | 'update' | 'cancel' | 'approve';
export type Scope = 'all' | 'limit' | 'own';

// Ruxsat modullari: tenant modullari + yadrodagi alohida bo'limlar
export type PermModule = Exclude<ModuleKey, 'core' | 'int' | 'tg'>
  | 'dashboard' | 'hr.secret' | 'ctl.suspicious' | 'settings' | 'audit';

/** Ruxsat moduli qaysi tenant moduliga tegishli (modul o'chiq bo'lsa ruxsat ham yo'q). */
export const TENANT_MODULE: Record<PermModule, ModuleKey> = {
  dashboard: 'core', settings: 'core', audit: 'core',
  hr: 'hr', 'hr.secret': 'hr', att: 'att', pay: 'pay', fin: 'fin', cp: 'cp', sal: 'sal', pur: 'pur',
  inv: 'inv', doc: 'doc', tsk: 'tsk', apr: 'apr', ctl: 'ctl', 'ctl.suspicious': 'ctl', mgt: 'mgt',
};

export const SYSTEM_ROLES = [
  'Ega', 'Direktor', 'Buxgalter', 'HR menejer', 'Bo‘lim boshlig‘i', 'Savdo menejeri', 'Kassir', 'Omborchi', 'Xodim',
] as const;

// Belgilar (PRD 8): T — to'liq; Y — ko'rish, yaratish, o'zgartirish; K — faqat ko'rish;
// O — faqat o'ziniki yoki o'z bo'limi; L — limitgacha tasdiqlaydi; S — so'rov yuboradi; - — yo'q
type Code = 'T' | 'Y' | 'K' | 'O' | 'L' | 'S' | '-';

const CODES: Record<Code, [Action, Scope][]> = {
  T: [['view', 'all'], ['create', 'all'], ['update', 'all'], ['cancel', 'all'], ['approve', 'all']],
  Y: [['view', 'all'], ['create', 'all'], ['update', 'all']],
  K: [['view', 'all']],
  O: [['view', 'own'], ['create', 'own'], ['update', 'own']],
  L: [['view', 'all'], ['approve', 'limit']],
  S: [['view', 'own'], ['create', 'own']],
  '-': [],
};

//                         Ega  Dir  Buxg HR   Bo'l Savdo Kas Omb Xodim
const MATRIX: Record<PermModule, Code[]> = {
  dashboard:        ['T', 'K', 'K', 'K', 'O', 'O', '-', '-', '-'],
  hr:               ['T', 'K', 'K', 'T', 'O', '-', '-', '-', 'O'],
  'hr.secret':      ['T', '-', 'K', 'Y', '-', '-', '-', '-', 'O'],
  att:              ['K', 'K', 'K', 'T', 'O', 'O', 'O', 'O', 'O'],
  pay:              ['T', '-', 'Y', '-', '-', '-', '-', '-', 'O'],
  fin:              ['T', 'K', 'Y', '-', '-', '-', 'O', '-', '-'],
  cp:               ['T', 'K', 'Y', '-', 'K', 'O', 'K', 'K', '-'],
  sal:              ['T', 'K', 'K', '-', 'K', 'O', 'K', 'K', '-'],
  pur:              ['T', 'K', 'Y', '-', 'K', '-', '-', 'K', '-'],
  inv:              ['T', 'K', 'K', '-', 'K', 'K', '-', 'Y', '-'],
  doc:              ['T', 'Y', 'Y', 'Y', 'O', 'K', 'K', 'K', 'O'],
  tsk:              ['T', 'T', 'Y', 'Y', 'O', 'Y', 'O', 'O', 'O'],
  apr:              ['T', 'L', 'S', 'S', 'L', 'S', 'S', 'S', 'S'],
  ctl:              ['T', 'K', 'K', 'K', 'O', '-', '-', '-', '-'],
  'ctl.suspicious': ['T', 'K', '-', '-', '-', '-', '-', '-', '-'],
  mgt:              ['T', 'Y', 'K', '-', 'O', '-', '-', '-', '-'],
  settings:         ['T', '-', '-', '-', '-', '-', '-', '-', '-'],
  audit:            ['K', '-', '-', '-', '-', '-', '-', '-', '-'],
};

/** Tizim rolining ruxsatlari ro'yxati. */
export function permissionsFor(role: (typeof SYSTEM_ROLES)[number]) {
  const col = SYSTEM_ROLES.indexOf(role);
  return (Object.entries(MATRIX) as [PermModule, Code[]][]).flatMap(([module, codes]) =>
    CODES[codes[col]!].map(([action, scope]) => ({ module, action, scope })),
  );
}
