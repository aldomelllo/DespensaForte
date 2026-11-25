import {
  getAuthenticatedUser,
  getUserPantryState,
  saveUserPantryState,
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

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  res.setHeader('Cache-Control', 'no-store');

  if (!isStorageReady()) {
    res.status(503).json({ error: 'Armazenamento em nuvem não configurado.' });
    return;
  }

  try {
    // O ID do usuário vem SEMPRE do cookie assinado — garantindo isolamento estrito entre contas
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
      return;
    }

    if (req.method === 'GET') {
      const raw = await getUserPantryState(user.id);
      const parsed = raw ? JSON.parse(raw) : null;
      res.status(200).json({
        state: parsed,
        userId: user.id,
      });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = parseBody(req);
      const state = body.state as Record<string, unknown> | undefined;
      if (
        !state ||
        typeof state !== 'object' ||
        !Array.isArray(state.inventory) ||
        !Array.isArray(state.priceHistory) ||
        !Array.isArray(state.receipts) ||
        !state.settings
      ) {
        res.status(400).json({ error: 'Formato de dados da despensa inválido.' });
        return;
      }

      const serialized = JSON.stringify(state);
      if (serialized.length > 2_000_000) {
        res.status(413).json({ error: 'Tamanho máximo dos dados excedido.' });
        return;
      }

      await saveUserPantryState(user.id, serialized);
      res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
      return;
    }

    res.status(405).json({ error: 'Método não permitido.' });
  } catch (error) {
    console.error('Erro em /api/state:', error);
    const message = error instanceof Error ? error.message : 'Erro interno ao sincronizar dados.';
    res.status(500).json({ error: message });
  }
}
