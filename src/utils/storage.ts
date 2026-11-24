import type { AppState } from '../types/inventory';
import { createSeedState } from '../data/seedData';

const STORAGE_KEY = 'despensaforte_local_state_v1';

export function loadAppState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedState();
      saveAppState(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.inventory) || !Array.isArray(parsed.priceHistory)) {
      const seeded = createSeedState();
      saveAppState(seeded);
      return seeded;
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return parsed;
}
