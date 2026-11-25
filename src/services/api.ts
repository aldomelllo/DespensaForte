import type { AuthStatusResponse, AuthUser } from '../types/auth';
import type { AppState } from '../types/inventory';

async function parseJsonSafe<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/auth?action=me', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await parseJsonSafe<AuthStatusResponse>(response);
  if (response.status === 503 && data.storageConfigured === false) {
    return data;
  }
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível verificar a sessão.');
  }
  return data;
}

export async function bootstrapAdminAccount(payload: {
  username: string;
  displayName: string;
  password: string;
}): Promise<AuthUser> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'bootstrap', ...payload }),
  });
  const data = await parseJsonSafe<{ user?: AuthUser; error?: string }>(response);
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Não foi possível criar a conta de administrador.');
  }
  return data.user;
}

export async function loginWithPassword(
  username: string,
  password: string
): Promise<AuthUser> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username, password }),
  });
  const data = await parseJsonSafe<{ user?: AuthUser; error?: string }>(response);
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Usuário ou senha inválidos.');
  }
  return data.user;
}

export async function logoutSession(): Promise<void> {
  await fetch('/api/auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'logout' }),
  }).catch(() => {});
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<AuthUser> {
  const response = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'change-password', currentPassword, newPassword }),
  });
  const data = await parseJsonSafe<{ user?: AuthUser; error?: string }>(response);
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Não foi possível alterar sua senha.');
  }
  return data.user;
}

export async function fetchUserCloudState(): Promise<AppState | null> {
  const response = await fetch('/api/state', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  const data = await parseJsonSafe<{ state?: AppState | null; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao carregar seus dados da nuvem.');
  }
  return data.state ?? null;
}

export async function saveUserCloudState(state: AppState): Promise<void> {
  const response = await fetch('/api/state', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  if (!response.ok) {
    const data = await parseJsonSafe<{ error?: string }>(response);
    throw new Error(data.error || 'Falha ao salvar dados na nuvem.');
  }
}

export async function adminListUsers(): Promise<AuthUser[]> {
  const response = await fetch('/api/admin-users', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await parseJsonSafe<{ users?: AuthUser[]; error?: string }>(response);
  if (!response.ok || !Array.isArray(data.users)) {
    throw new Error(data.error || 'Falha ao listar clientes.');
  }
  return data.users;
}

export async function adminCreateClient(payload: {
  username: string;
  displayName: string;
  password: string;
  ocrMonthlyLimit: number;
  notes?: string;
}): Promise<AuthUser> {
  const response = await fetch('/api/admin-users', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe<{ user?: AuthUser; error?: string }>(response);
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Não foi possível criar o cliente.');
  }
  return data.user;
}

export async function adminUpdateClient(payload: {
  id: string;
  displayName?: string;
  active?: boolean;
  ocrMonthlyLimit?: number;
  newPassword?: string;
  notes?: string;
}): Promise<AuthUser> {
  const response = await fetch('/api/admin-users', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseJsonSafe<{ user?: AuthUser; error?: string }>(response);
  if (!response.ok || !data.user) {
    throw new Error(data.error || 'Não foi possível atualizar o cliente.');
  }
  return data.user;
}

export async function adminDeleteClient(id: string): Promise<void> {
  const response = await fetch(`/api/admin-users?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await parseJsonSafe<{ ok?: boolean; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error || 'Não foi possível excluir o cliente.');
  }
}
