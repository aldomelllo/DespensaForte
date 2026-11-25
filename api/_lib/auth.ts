import crypto from 'node:crypto';
import { getStore, isVercelRuntime } from './store';
import type {
  ApiRequestLike,
  ApiResponseLike,
  PublicUser,
  StoredUser,
  UserRole,
} from './types';

export const SESSION_COOKIE_NAME = 'df_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

const USERS_INDEX_KEY = 'df:users:ids';
const userByIdKey = (id: string) => `df:user:id:${id}`;
const userIdByNameKey = (username: string) => `df:user:name:${username}`;
const userStateKey = (userId: string) => `df:state:${userId}`;
const ocrUsageKey = (userId: string, monthKey: string) => `df:ocr:${userId}:${monthKey}`;

export function getCurrentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function validateUsername(username: string): string | null {
  if (!username || username.length < 3 || username.length > 80) {
    return 'O usuário deve ter entre 3 e 80 caracteres.';
  }
  if (!/^[a-z0-9._@-]+$/.test(username)) {
    return 'Use apenas letras, números, ponto (.), underline (_), hífen (-) ou @ no usuário.';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 6) {
    return 'A senha deve ter no mínimo 6 caracteres.';
  }
  if (password.length > 128) {
    return 'A senha deve ter no máximo 128 caracteres.';
  }
  return null;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash: derived, salt: usedSalt };
}

export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, storedSalt, 64);
    const expected = Buffer.from(storedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function getSigningSecret(): string {
  const explicit = process.env.AUTH_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;

  const fallbackSeed = [
    process.env.UPSTASH_REDIS_REST_TOKEN || '',
    process.env.KV_REST_API_TOKEN || '',
    process.env.GEMINI_API_KEY || '',
    'despensaforte-local-dev-secret-v1',
  ].join('|');

  return crypto.createHash('sha256').update(fallbackSeed).digest('hex');
}

interface SessionPayload {
  uid: string;
  role: UserRole;
  ver: number;
  exp: number;
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (norm.length % 4)) % 4;
  return Buffer.from(norm + '='.repeat(pad), 'base64').toString('utf8');
}

export function createSessionToken(user: StoredUser): string {
  const payload: SessionPayload = {
    uid: user.id,
    role: user.role,
    ver: user.tokenVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${toBase64Url(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, encodedSig] = parts;
    const expectedSig = toBase64Url(
      crypto
        .createHmac('sha256', getSigningSecret())
        .update(encodedPayload)
        .digest()
    );
    const a = Buffer.from(encodedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;
    if (!payload || !payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req: ApiRequestLike): Record<string, string> {
  const raw = req.headers?.cookie || req.headers?.Cookie;
  const header = Array.isArray(raw) ? raw.join('; ') : raw || '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (name) {
      result[name] = decodeURIComponent(val);
    }
  }
  return result;
}

export function setSessionCookie(res: ApiResponseLike, token: string): void {
  const securePart = isVercelRuntime() || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${securePart}`;
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res: ApiResponseLike): void {
  const securePart = isVercelRuntime() || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`;
  res.setHeader('Set-Cookie', cookie);
}

async function getUserIds(): Promise<string[]> {
  const store = getStore();
  const raw = await store.get(USERS_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function saveUserIds(ids: string[]): Promise<void> {
  const store = getStore();
  await store.set(USERS_INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export async function getStoredUserById(id: string): Promise<StoredUser | null> {
  const store = getStore();
  const raw = await store.get(userByIdKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function getStoredUserByUsername(username: string): Promise<StoredUser | null> {
  const norm = normalizeUsername(username);
  if (!norm) return null;
  const store = getStore();
  const id = await store.get(userIdByNameKey(norm));
  if (!id) return null;
  return getStoredUserById(id);
}

export async function getOcrUsedThisMonth(
  userId: string,
  monthKey: string = getCurrentMonthKey()
): Promise<number> {
  const store = getStore();
  const raw = await store.get(ocrUsageKey(userId, monthKey));
  return Math.max(0, parseInt(raw || '0', 10) || 0);
}

export async function incrementOcrUsage(
  userId: string,
  monthKey: string = getCurrentMonthKey()
): Promise<number> {
  const store = getStore();
  return store.incr(ocrUsageKey(userId, monthKey));
}

export async function toPublicUser(
  user: StoredUser,
  monthKey: string = getCurrentMonthKey()
): Promise<PublicUser> {
  const used = await getOcrUsedThisMonth(user.id, monthKey);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    ocrMonthlyLimit: user.ocrMonthlyLimit,
    ocrUsedThisMonth: used,
    ocrMonthKey: monthKey,
    notes: user.notes,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function ensureEnvAdminIfConfigured(): Promise<void> {
  const ids = await getUserIds();
  if (ids.length > 0) return;

  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!envPassword || envPassword.length < 6) return;

  const envUsername = normalizeUsername(process.env.ADMIN_USERNAME || 'admin');
  const envDisplayName = (process.env.ADMIN_NAME || 'Administrador').trim();

  await createUserRecord({
    username: envUsername,
    displayName: envDisplayName,
    password: envPassword,
    role: 'admin',
    ocrMonthlyLimit: -1,
  });
}

export async function hasAnyUsers(): Promise<boolean> {
  await ensureEnvAdminIfConfigured();
  const ids = await getUserIds();
  return ids.length > 0;
}

export async function createUserRecord(input: {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
  ocrMonthlyLimit: number;
  notes?: string;
}): Promise<StoredUser> {
  const norm = normalizeUsername(input.username);
  const usernameErr = validateUsername(norm);
  if (usernameErr) throw new Error(usernameErr);

  const passErr = validatePassword(input.password);
  if (passErr) throw new Error(passErr);

  const displayName = input.displayName.trim();
  if (!displayName) throw new Error('Informe o nome do usuário.');

  const existing = await getStoredUserByUsername(norm);
  if (existing) {
    throw new Error('Já existe uma conta cadastrada com este usuário.');
  }

  const { hash, salt } = hashPassword(input.password);
  const id = `usr_${crypto.randomBytes(8).toString('hex')}`;
  const user: StoredUser = {
    id,
    username: norm,
    displayName,
    role: input.role,
    active: true,
    passwordHash: hash,
    passwordSalt: salt,
    tokenVersion: 1,
    ocrMonthlyLimit: input.role === 'admin' ? -1 : Math.max(0, Math.floor(input.ocrMonthlyLimit)),
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const store = getStore();
  await store.set(userByIdKey(id), JSON.stringify(user));
  await store.set(userIdByNameKey(norm), id);
  const ids = await getUserIds();
  ids.push(id);
  await saveUserIds(ids);

  return user;
}

export async function bootstrapFirstAdmin(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<StoredUser> {
  const exists = await hasAnyUsers();
  if (exists) {
    throw new Error('BOOTSTRAP_ALREADY_DONE: O administrador inicial já foi configurado.');
  }
  return createUserRecord({
    username: input.username,
    displayName: input.displayName,
    password: input.password,
    role: 'admin',
    ocrMonthlyLimit: -1,
  });
}

export async function authenticateUser(
  username: string,
  password: string
): Promise<{ user: StoredUser; token: string }> {
  await ensureEnvAdminIfConfigured();
  const norm = normalizeUsername(username);
  const user = await getStoredUserByUsername(norm);
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    throw new Error('Usuário ou senha inválidos.');
  }
  if (!user.active) {
    throw new Error('Seu acesso está bloqueado. Entre em contato com o administrador.');
  }

  const updated: StoredUser = {
    ...user,
    lastLoginAt: new Date().toISOString().slice(0, 10),
  };
  await getStore().set(userByIdKey(updated.id), JSON.stringify(updated));

  const token = createSessionToken(updated);
  return { user: updated, token };
}

export async function getAuthenticatedUser(req: ApiRequestLike): Promise<StoredUser | null> {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await getStoredUserById(payload.uid);
  if (!user) return null;
  if (!user.active) return null;
  if (user.tokenVersion !== payload.ver) return null;

  return user;
}

export async function listAllUsers(): Promise<PublicUser[]> {
  const ids = await getUserIds();
  const monthKey = getCurrentMonthKey();
  const results: PublicUser[] = [];
  for (const id of ids) {
    const user = await getStoredUserById(id);
    if (user) {
      results.push(await toPublicUser(user, monthKey));
    }
  }
  return results.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function updateUserByAdmin(
  targetId: string,
  patch: {
    displayName?: string;
    active?: boolean;
    ocrMonthlyLimit?: number;
    newPassword?: string;
    notes?: string;
  },
  actorAdminId: string
): Promise<StoredUser> {
  const user = await getStoredUserById(targetId);
  if (!user) throw new Error('Usuário não encontrado.');

  if (user.id === actorAdminId && patch.active === false) {
    throw new Error('Você não pode bloquear sua própria conta de administrador.');
  }

  let nextHash = user.passwordHash;
  let nextSalt = user.passwordSalt;
  let nextTokenVersion = user.tokenVersion;

  if (patch.newPassword !== undefined && patch.newPassword !== '') {
    const passErr = validatePassword(patch.newPassword);
    if (passErr) throw new Error(passErr);
    const hashed = hashPassword(patch.newPassword);
    nextHash = hashed.hash;
    nextSalt = hashed.salt;
    nextTokenVersion += 1;
  }

  if (patch.active === false && user.active) {
    nextTokenVersion += 1;
  }

  const updated: StoredUser = {
    ...user,
    displayName:
      patch.displayName !== undefined && patch.displayName.trim()
        ? patch.displayName.trim()
        : user.displayName,
    active: patch.active !== undefined ? Boolean(patch.active) : user.active,
    ocrMonthlyLimit:
      user.role === 'admin'
        ? -1
        : patch.ocrMonthlyLimit !== undefined && Number.isFinite(patch.ocrMonthlyLimit)
          ? Math.max(0, Math.floor(patch.ocrMonthlyLimit))
          : user.ocrMonthlyLimit,
    notes: patch.notes !== undefined ? patch.notes.trim() || undefined : user.notes,
    passwordHash: nextHash,
    passwordSalt: nextSalt,
    tokenVersion: nextTokenVersion,
  };

  await getStore().set(userByIdKey(updated.id), JSON.stringify(updated));
  return updated;
}

export async function deleteUserByAdmin(
  targetId: string,
  actorAdminId: string
): Promise<void> {
  if (targetId === actorAdminId) {
    throw new Error('Você não pode excluir sua própria conta de administrador.');
  }
  const user = await getStoredUserById(targetId);
  if (!user) throw new Error('Usuário não encontrado.');
  if (user.role === 'admin') {
    throw new Error('Não é permitido excluir outra conta de administrador.');
  }

  const store = getStore();
  await store.del(userByIdKey(user.id));
  await store.del(userIdByNameKey(user.username));
  await store.del(userStateKey(user.id));

  const ids = await getUserIds();
  await saveUserIds(ids.filter((id) => id !== user.id));
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ user: StoredUser; token: string }> {
  const user = await getStoredUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
    throw new Error('A senha atual informada está incorreta.');
  }
  const passErr = validatePassword(newPassword);
  if (passErr) throw new Error(passErr);

  const hashed = hashPassword(newPassword);
  const updated: StoredUser = {
    ...user,
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    tokenVersion: user.tokenVersion + 1,
  };
  await getStore().set(userByIdKey(updated.id), JSON.stringify(updated));
  const token = createSessionToken(updated);
  return { user: updated, token };
}

export async function getUserPantryState(userId: string): Promise<string | null> {
  return getStore().get(userStateKey(userId));
}

export async function saveUserPantryState(userId: string, stateJson: string): Promise<void> {
  await getStore().set(userStateKey(userId), stateJson);
}

export async function checkOcrQuotaForUser(
  user: StoredUser,
  monthKey: string = getCurrentMonthKey()
): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
  const used = await getOcrUsedThisMonth(user.id, monthKey);
  if (user.role === 'admin' || user.ocrMonthlyLimit < 0) {
    return { allowed: true, used, limit: -1, remaining: -1 };
  }
  const limit = Math.max(0, user.ocrMonthlyLimit);
  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
  };
}
