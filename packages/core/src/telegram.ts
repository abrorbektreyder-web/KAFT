// Telegram'ga yuborish porti. Haqiqiy — grammY (worker'da, token bilan); testda — FakeTelegram.
// Qoida: xabarda maxfiy ma'lumot (pasport, JShShIR, karta, oylik summasi) bo'lmaydi — Telegram serverlari xorijda.
export interface TelegramPort {
  send(chatId: string, text: string): Promise<void>;
}

export class FakeTelegram implements TelegramPort {
  readonly sent: { chatId: string; text: string }[] = [];
  async send(chatId: string, text: string) {
    this.sent.push({ chatId, text });
  }
}
