export type UserRole = 'admin' | 'user';

export interface StoredUser {
  id: string;
  username: string; // normalizado em minúsculas (login ou email)
  displayName: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  passwordSalt: string;
  tokenVersion: number;
  ocrMonthlyLimit: number; // 0 = bloqueado OCR, -1 = ilimitado (ADM), >0 = limite mensal
  notes?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  ocrMonthlyLimit: number;
  ocrUsedThisMonth: number;
  ocrMonthKey: string;
  notes?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface ApiRequestLike {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string | string[]): void;
}
