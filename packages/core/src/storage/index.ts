// Fayl ombori interfeysi. Hozir — lokal papka (dev); server tanlanganda S3-mos versiya qo'shiladi,
// qolgan kod o'zgarmaydi.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface FileStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

// Kalit faqat `{tenantId}/{docId}` (uuid) — papkadan tashqariga chiqish (../) mumkin emas
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

export class LocalDiskStorage implements FileStorage {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private path(key: string) {
    if (!KEY.test(key)) throw new Error(`Noto'g'ri fayl kaliti: ${key}`);
    return join(this.root, key);
  }
  async put(key: string, data: Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
}
