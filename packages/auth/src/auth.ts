import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins/two-factor';
import type { Db } from '@kaft/db';
import { authSchema } from '@kaft/db';
import type { Mailer } from './mailer.ts';

export interface AuthDeps {
  db: Db;
  mailer: Mailer;
  baseURL: string;
  secret: string;
}

// PRD 10: faol bo'lmagan sessiya 12 soatda tugaydi — har foydalanishda muddat yangilanadi
export const SESSION_TTL = 60 * 60 * 12;

export function createAuth({ db, mailer, baseURL, secret }: AuthDeps) {
  return betterAuth({
    appName: 'Kaft',
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    user: { modelName: 'auth_user' },
    session: { modelName: 'auth_session', expiresIn: SESSION_TTL, updateAge: 60 * 5 },
    account: { modelName: 'auth_account' },
    verification: { modelName: 'auth_verification' },
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({ to: user.email, subject: 'Kaft — parolni tiklash', text: `Parolni tiklash havolasi: ${url}` });
      },
    },
    plugins: [twoFactor({ issuer: 'Kaft', twoFactorTable: 'auth_two_factor' })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
