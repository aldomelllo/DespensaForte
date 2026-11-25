export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  ocrMonthlyLimit: number; // -1 = ilimitado (ADM), 0 = bloqueado, >0 = limite mensal
  ocrUsedThisMonth: number;
  ocrMonthKey: string;
  notes?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthStatusResponse {
  storageConfigured: boolean;
  needsBootstrap: boolean;
  user: AuthUser | null;
  error?: string;
}
