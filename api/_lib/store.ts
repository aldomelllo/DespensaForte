import fs from 'node:fs';
import path from 'node:path';

export interface KeyValueStore {
  readonly mode: 'upstash' | 'local_file' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
}

function getUpstashConfig(): { url: string; token: string } | null {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ''
  ).trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ''
  ).trim();

  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isCloudStorageConfigured(): boolean {
  return getUpstashConfig() !== null;
}

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

class UpstashRestStore implements KeyValueStore {
  readonly mode = 'upstash' as const;
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  private async command<T>(args: Array<string | number>): Promise<T> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Erro no banco Upstash Redis (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) {
      throw new Error(`Erro Upstash Redis: ${payload.error}`);
    }
    return payload.result as T;
  }

  async get(key: string): Promise<string | null> {
    const val = await this.command<string | null>(['GET', key]);
    return typeof val === 'string' ? val : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.command<string>(['SET', key, value]);
  }

  async del(key: string): Promise<void> {
    await this.command<number>(['DEL', key]);
  }

  async incr(key: string): Promise<number> {
    const next = await this.command<number>(['INCR', key]);
    return Number(next) || 1;
  }
}

class LocalFileStore implements KeyValueStore {
  readonly mode = 'local_file' as const;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private readAll(): Record<string, string> {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeAll(data: Record<string, string>): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async get(key: string): Promise<string | null> {
    const all = this.readAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  }

  async set(key: string, value: string): Promise<void> {
    const all = this.readAll();
    all[key] = value;
    this.writeAll(all);
  }

  async del(key: string): Promise<void> {
    const all = this.readAll();
    delete all[key];
    this.writeAll(all);
  }

  async incr(key: string): Promise<number> {
    const all = this.readAll();
    const cur = parseInt(all[key] || '0', 10) || 0;
    const next = cur + 1;
    all[key] = String(next);
    this.writeAll(all);
    return next;
  }
}

export class MemoryStore implements KeyValueStore {
  readonly mode = 'memory' as const;
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async incr(key: string): Promise<number> {
    const cur = parseInt(this.data.get(key) || '0', 10) || 0;
    const next = cur + 1;
    this.data.set(key, String(next));
    return next;
  }
}

let customTestStore: KeyValueStore | null = null;

export function setTestStore(store: KeyValueStore | null): void {
  customTestStore = store;
}

export function getStore(): KeyValueStore {
  if (customTestStore) return customTestStore;

  const upstash = getUpstashConfig();
  if (upstash) {
    return new UpstashRestStore(upstash.url, upstash.token);
  }

  if (isVercelRuntime()) {
    throw new Error(
      'STORAGE_NOT_CONFIGURED: Conecte um banco Upstash Redis na aba Storage da Vercel para ativar login e contas de clientes.'
    );
  }

  const devDbPath = path.resolve(process.cwd(), '.despensaforte-dev-db.json');
  return new LocalFileStore(devDbPath);
}

export function isStorageReady(): boolean {
  if (customTestStore) return true;
  if (isCloudStorageConfigured()) return true;
  return !isVercelRuntime();
}
