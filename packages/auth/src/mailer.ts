// Email yuborish. Hozircha konsolga chiqaradi va har xatni qayd qiladi;
// haqiqiy provayder (Resend/SMTP) keyin shu interfeys orqali ulanadi.
export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

export class ConsoleMailer implements Mailer {
  readonly outbox: (Mail & { at: Date })[] = [];
  quiet: boolean;
  constructor(opts: { quiet?: boolean } = {}) {
    this.quiet = opts.quiet ?? false;
  }
  async send(mail: Mail) {
    this.outbox.push({ ...mail, at: new Date() });
    if (!this.quiet) console.log(`\n✉  ${mail.to}\n   ${mail.subject}\n   ${mail.text}\n`);
  }

  /** Yuborilgan xatlar hisoboti (dev rejimida tekshirish uchun). */
  report(): string {
    const lines = this.outbox.map((m) => `  ${m.at.toISOString().slice(11, 19)}  ${m.to} — ${m.subject}`);
    return [`Yuborilgan xatlar: ${this.outbox.length}`, ...lines].join('\n');
  }
}
