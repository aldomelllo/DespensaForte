import {
  authenticateUser,
  bootstrapFirstAdmin,
  changeOwnPassword,
  clearSessionCookie,
  getAuthenticatedUser,
  hasAnyUsers,
  setSessionCookie,
  toPublicUser,
} from './_lib/auth.js';
import { isStorageReady } from './_lib/store.js';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types.js';

function parseBody(req: ApiRequestLike): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body as Record<string, unknown>;
}

function getAction(req: ApiRequestLike, body: Record<string, unknown>): string {
  const queryAction = req.query?.action;
  if (typeof queryAction === 'string' && queryAction) return queryAction;
  if (typeof body.action === 'string' && body.action) return body.action;
  if (req.url && req.url.includes('action=')) {
    const urlObj = new URL(req.url, 'http://localhost');
    const a = urlObj.searchParams.get('action');
    if (a) return a;
  }
  return req.method === 'GET' ? 'me' : '';
}

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  res.setHeader('Cache-Control', 'no-store');

  if (!isStorageReady()) {
    res.status(503).json({
      storageConfigured: false,
      needsBootstrap: false,
      user: null,
      error:
        'Banco de dados na nuvem ainda não conectado. Na Vercel, abra a aba Storage, crie um banco Upstash Redis gratuito conectado a este projeto e clique em Redeploy.',
    });
    return;
  }

  try {
    const body = parseBody(req);
    const action = getAction(req, body);

    if (req.method === 'GET' || action === 'me') {
      const anyUsers = await hasAnyUsers();
      const user = await getAuthenticatedUser(req);
      res.status(200).json({
        storageConfigured: true,
        needsBootstrap: !anyUsers,
        user: user ? await toPublicUser(user) : null,
      });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método não permitido.' });
      return;
    }

    if (action === 'logout') {
      clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'bootstrap') {
      const username = typeof body.username === 'string' ? body.username : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName : 'Administrador';
      const password = typeof body.password === 'string' ? body.password : '';

      const adminUser = await bootstrapFirstAdmin({ username, displayName, password });
      const auth = await authenticateUser(adminUser.username, password);
      setSessionCookie(res, auth.token);
      res.status(201).json({
        user: await toPublicUser(auth.user),
      });
      return;
    }

    if (action === 'login') {
      const username = typeof body.username === 'string' ? body.username : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const { user, token } = await authenticateUser(username, password);
      setSessionCookie(res, token);
      res.status(200).json({
        user: await toPublicUser(user),
      });
      return;
    }

    if (action === 'change-password') {
      const sessionUser = await getAuthenticatedUser(req);
      if (!sessionUser) {
        res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
        return;
      }
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const { user, token } = await changeOwnPassword(
        sessionUser.id,
        currentPassword,
        newPassword
      );
      setSessionCookie(res, token);
      res.status(200).json({
        ok: true,
        user: await toPublicUser(user),
      });
      return;
    }

    res.status(400).json({ error: 'Ação de autenticação inválida.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno de autenticação.';
    if (message.startsWith('BOOTSTRAP_ALREADY_DONE')) {
      res.status(409).json({ error: 'A conta de administrador inicial já foi criada. Faça login.' });
      return;
    }
    if (message.includes('bloqueado')) {
      res.status(403).json({ error: message });
      return;
    }
    if (message.includes('inválidos') || message.includes('incorreta')) {
      res.status(401).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
}
