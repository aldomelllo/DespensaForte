import type { AppState } from '../types/inventory';
import { createSeedState } from '../data/seedData';
import { defaultIsStockpileForCategory } from './analytics';

const LEGACY_STORAGE_KEY = 'despensaforte_local_state_v1';
const userCacheKey = (userId: string) => `despensaforte_user_state_${userId}`;

export function createEmptyState(): AppState {
  return {
    settings: {
      pushEnabled: false,
      warningDays: 30,
      criticalDays: 7,
      householdSize: 2,
      dailyCostPerPerson: 25,
    },
    inventory: [],
    priceHistory: [],
    receipts: [],
  };
}

export function normalizeAppState(rawState: AppState): AppState {
  return {
    settings: {
      pushEnabled: Boolean(rawState.settings?.pushEnabled ?? false),
      warningDays: Math.max(1, Number(rawState.settings?.warningDays ?? 30)),
      criticalDays: Math.max(1, Number(rawState.settings?.criticalDays ?? 7)),
      householdSize: Math.max(1, Number(rawState.settings?.householdSize ?? 2)),
      dailyCostPerPerson: Math.max(1, Number(rawState.settings?.dailyCostPerPerson ?? 25)),
    },
    inventory: (rawState.inventory ?? []).map((item) => ({
      ...item,
      expiryDate: typeof item.expiryDate === 'string' ? item.expiryDate : '',
      isStockpile:
        typeof item.isStockpile === 'boolean'
          ? item.isStockpile
          : defaultIsStockpileForCategory(item.category),
      insertedAt: item.insertedAt || item.purchaseDate,
    })),
    priceHistory: (rawState.priceHistory ?? []).map((rec) => ({
      ...rec,
      isStockpile:
        typeof rec.isStockpile === 'boolean'
          ? rec.isStockpile
          : defaultIsStockpileForCategory(rec.category),
      insertedAt: rec.insertedAt || rec.purchaseDate,
    })),
    receipts: (rawState.receipts ?? []).map((receipt) => ({
      ...receipt,
      insertedAt: receipt.insertedAt || receipt.createdAt || receipt.purchaseDate,
      createdAt: receipt.createdAt || receipt.insertedAt || receipt.purchaseDate,
      items: (receipt.items ?? []).map((item) => ({
        ...item,
        expiryDate: typeof item.expiryDate === 'string' ? item.expiryDate : '',
        isStockpile:
          typeof item.isStockpile === 'boolean'
            ? item.isStockpile
            : defaultIsStockpileForCategory(item.category),
      })),
    })),
  };
}

export function loadCachedUserState(userId: string): AppState | null {
  try {
    const raw = window.localStorage.getItem(userCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.inventory) || !Array.isArray(parsed.priceHistory)) {
      return null;
    }
    return normalizeAppState(parsed);
  } catch {
    return null;
  }
}

export function saveCachedUserState(userId: string, state: AppState): void {
  try {
    window.localStorage.setItem(userCacheKey(userId), JSON.stringify(state));
  } catch (err) {
    console.error('Erro ao salvar cache local do usuário:', err);
  }
}

export function loadAppState(): AppState {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return createSeedState();
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.inventory) || !Array.isArray(parsed.priceHistory)) {
      return createSeedState();
    }
    return normalizeAppState(parsed);
  } catch {
    return createSeedState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Erro ao salvar estado local:', err);
  }
}

export function exportStateAsJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImportedState(jsonText: string): AppState {
  const parsed = JSON.parse(jsonText) as AppState;
  if (
    !parsed ||
    !Array.isArray(parsed.inventory) ||
    !Array.isArray(parsed.priceHistory) ||
    !Array.isArray(parsed.receipts) ||
    !parsed.settings
  ) {
    throw new Error('Arquivo JSON incompatível com o formato do DespensaForte.');
  }
  return normalizeAppState(parsed);
}
