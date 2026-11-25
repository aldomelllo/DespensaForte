import {
  createUserRecord,
  deleteUserByAdmin,
  getAuthenticatedUser,
  listAllUsers,
  toPublicUser,
  updateUserByAdmin,
} from './_lib/auth';
import { isStorageReady } from './_lib/store';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types';

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

function extractTargetId(req: ApiRequestLike, body: Record<string, unknown>): string {
  if (typeof body.id === 'string' && body.id) return body.id;
  if (typeof req.query?.id === 'string' && req.query.id) return req.query.id;
  if (req.url && req.url.includes('id=')) {
    const urlObj = new URL(req.url, 'http://localhost');
    return urlObj.searchParams.get('id') || '';
  }
  return '';
}

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  res.setHeader('Cache-Control', 'no-store');

  if (!isStorageReady()) {
    res.status(503).json({ error: 'Armazenamento em nuvem não configurado.' });
    return;
  }

  try {
    const sessionUser = await getAuthenticatedUser(req);
    if (!sessionUser) {
      res.status(401).json({ error: 'Faça login para continuar.' });
      return;
    }
    if (sessionUser.role !== 'admin') {
      res.status(403).json({ error: 'Acesso restrito ao administrador.' });
      return;
    }

    if (req.method === 'GET') {
      const users = await listAllUsers();
      res.status(200).json({ users });
      return;
    }

    const body = parseBody(req);

    if (req.method === 'POST') {
      const username = typeof body.username === 'string' ? body.username : '';
      const displayName = typeof body.displayName === 'string' ? body.displayName : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const rawLimit = Number(body.ocrMonthlyLimit);
      const ocrMonthlyLimit = Number.isFinite(rawLimit) ? rawLimit : 30;
      const notes = typeof body.notes === 'string' ? body.notes : undefined;

      const created = await createUserRecord({
        username,
        displayName,
        password,
        role: 'user',
        ocrMonthlyLimit,
        notes,
      });

      res.status(201).json({ user: await toPublicUser(created) });
      return;
    }

    if (req.method === 'PATCH') {
      const id = extractTargetId(req, body);
      if (!id) {
        res.status(400).json({ error: 'ID do usuário não informado.' });
        return;
      }

      const updated = await updateUserByAdmin(
        id,
        {
          displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
          active: typeof body.active === 'boolean' ? body.active : undefined,
          ocrMonthlyLimit:
            body.ocrMonthlyLimit !== undefined ? Number(body.ocrMonthlyLimit) : undefined,
          newPassword: typeof body.newPassword === 'string' ? body.newPassword : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        },
        sessionUser.id
      );

      res.status(200).json({ user: await toPublicUser(updated) });
      return;
    }

    if (req.method === 'DELETE') {
      const id = extractTargetId(req, body);
      if (!id) {
        res.status(400).json({ error: 'ID do usuário não informado.' });
        return;
      }

      await deleteUserByAdmin(id, sessionUser.id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerenciar usuários.';
    res.status(400).json({ error: message });
  }
}
