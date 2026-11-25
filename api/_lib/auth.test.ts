import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, setTestStore } from './store';
import {
  authenticateUser,
  bootstrapFirstAdmin,
  changeOwnPassword,
  checkOcrQuotaForUser,
  createUserRecord,
  incrementOcrUsage,
  SESSION_COOKIE_NAME,
  updateUserByAdmin,
} from './auth';
import adminUsersHandler from '../admin-users';
import stateHandler from '../state';
import type { ApiRequestLike, ApiResponseLike } from './types';

function createMockRes() {
  let statusCode = 200;
  let jsonBody: unknown = null;
  const headers: Record<string, string | string[]> = {};

  const res: ApiResponseLike = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
    },
  };

  return {
    res,
    getStatus: () => statusCode,
    getBody: <T = Record<string, unknown>>() => jsonBody as T,
    getHeaders: () => headers,
  };
}

function withSessionCookie(token: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

test('multi-tenant auth: bootstrap once, strict user isolation, admin-only routes, blocking, and OCR quota', async () => {
  setTestStore(new MemoryStore());

  try {
    // 1. Bootstrap inicial cria o primeiro ADM e bloqueia segunda tentativa
    const admin = await bootstrapFirstAdmin({
      username: 'aldo',
      displayName: 'Aldo ADM',
      password: 'admin-password-123',
    });
    assert.equal(admin.role, 'admin');

    await assert.rejects(
      () =>
        bootstrapFirstAdmin({
          username: 'hacker',
          displayName: 'Intruso',
          password: 'password-123',
        }),
      /BOOTSTRAP_ALREADY_DONE/
    );

    const adminAuth = await authenticateUser('aldo', 'admin-password-123');

    // 2. ADM cria dois clientes separados: Maria e João
    const maria = await createUserRecord({
      username: 'maria',
      displayName: 'Maria Silva',
      password: 'maria-pass-123',
      role: 'user',
      ocrMonthlyLimit: 30,
    });
    const joao = await createUserRecord({
      username: 'joao',
      displayName: 'João Souza',
      password: 'joao-pass-123',
      role: 'user',
      ocrMonthlyLimit: 2,
    });

    const mariaAuth = await authenticateUser('maria', 'maria-pass-123');
    const joaoAuth = await authenticateUser('joao', 'joao-pass-123');

    // 3. Cliente comum NÃO pode acessar painel ADM (/api/admin-users -> 403)
    const mariaAdminAttempt = createMockRes();
    await adminUsersHandler(
      {
        method: 'GET',
        headers: withSessionCookie(mariaAuth.token),
      } as ApiRequestLike,
      mariaAdminAttempt.res
    );
    assert.equal(mariaAdminAttempt.getStatus(), 403);

    // ADM consegue listar todos os usuários
    const adminListRes = createMockRes();
    await adminUsersHandler(
      {
        method: 'GET',
        headers: withSessionCookie(adminAuth.token),
      } as ApiRequestLike,
      adminListRes.res
    );
    assert.equal(adminListRes.getStatus(), 200);
    assert.equal((adminListRes.getBody<{ users: unknown[] }>().users || []).length, 3);

    // 4. Isolamento total de dados entre Maria e João no /api/state
    const mariaState = {
      inventory: [{ id: 'm-1', name: 'Arroz da Maria' }],
      priceHistory: [],
      receipts: [],
      settings: { householdSize: 2, warningDays: 30, criticalDays: 7, pushEnabled: false, dailyCostPerPerson: 25 },
    };
    const joaoState = {
      inventory: [{ id: 'j-1', name: 'Feijão do João' }],
      priceHistory: [],
      receipts: [],
      settings: { householdSize: 4, warningDays: 15, criticalDays: 5, pushEnabled: false, dailyCostPerPerson: 30 },
    };

    const saveMaria = createMockRes();
    await stateHandler(
      { method: 'PUT', headers: withSessionCookie(mariaAuth.token), body: { state: mariaState } },
      saveMaria.res
    );
    assert.equal(saveMaria.getStatus(), 200);

    const saveJoao = createMockRes();
    await stateHandler(
      { method: 'PUT', headers: withSessionCookie(joaoAuth.token), body: { state: joaoState } },
      saveJoao.res
    );
    assert.equal(saveJoao.getStatus(), 200);

    const readMaria = createMockRes();
    await stateHandler(
      { method: 'GET', headers: withSessionCookie(mariaAuth.token) },
      readMaria.res
    );
    assert.equal(readMaria.getStatus(), 200);
    assert.deepEqual(readMaria.getBody<{ state: typeof mariaState }>().state.inventory, mariaState.inventory);

    const readJoao = createMockRes();
    await stateHandler(
      { method: 'GET', headers: withSessionCookie(joaoAuth.token) },
      readJoao.res
    );
    assert.equal(readJoao.getStatus(), 200);
    assert.deepEqual(readJoao.getBody<{ state: typeof joaoState }>().state.inventory, joaoState.inventory);

    // 5. Bloqueio de cliente invalida sessão imediatamente
    await updateUserByAdmin(maria.id, { active: false }, admin.id);

    const blockedStateRead = createMockRes();
    await stateHandler(
      { method: 'GET', headers: withSessionCookie(mariaAuth.token) },
      blockedStateRead.res
    );
    assert.equal(blockedStateRead.getStatus(), 401);

    await assert.rejects(
      () => authenticateUser('maria', 'maria-pass-123'),
      /bloqueado/
    );

    // 6. Limite mensal de OCR aplicado por cliente (João = 2/mês; ADM = ilimitado)
    const month = '2026-11';
    assert.equal((await checkOcrQuotaForUser(joao, month)).allowed, true);
    await incrementOcrUsage(joao.id, month);
    await incrementOcrUsage(joao.id, month);
    const quotaAfter2 = await checkOcrQuotaForUser(joao, month);
    assert.equal(quotaAfter2.allowed, false);
    assert.equal(quotaAfter2.used, 2);
    assert.equal(quotaAfter2.remaining, 0);

    const adminQuota = await checkOcrQuotaForUser(admin, month);
    assert.equal(adminQuota.allowed, true);
    assert.equal(adminQuota.limit, -1);

    // 7. Troca da própria senha invalida token antigo e aceita senha nova
    const changed = await changeOwnPassword(joao.id, 'joao-pass-123', 'joao-nova-456');
    const oldTokenRead = createMockRes();
    await stateHandler(
      { method: 'GET', headers: withSessionCookie(joaoAuth.token) },
      oldTokenRead.res
    );
    assert.equal(oldTokenRead.getStatus(), 401);

    const newTokenRead = createMockRes();
    await stateHandler(
      { method: 'GET', headers: withSessionCookie(changed.token) },
      newTokenRead.res
    );
    assert.equal(newTokenRead.getStatus(), 200);
  } finally {
    setTestStore(null);
  }
});
