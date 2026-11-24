export type CategoryId =
  | 'Grãos & Secos'
  | 'Proteínas & Enlatados'
  | 'Água & Bebidas'
  | 'Óleos & Temperos'
  | 'Higiene & Limpeza'
  | 'Primeiros Socorros & Energia'
  | 'Outros';

export const CATEGORIES: CategoryId[] = [
  'Grãos & Secos',
  'Proteínas & Enlatados',
  'Água & Bebidas',
  'Óleos & Temperos',
  'Higiene & Limpeza',
  'Primeiros Socorros & Energia',
  'Outros',
];

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok';

export type PriceSignal = 'ideal_to_stock' | 'stable' | 'above_average';

export interface InventoryItem {
  id: string;
  productKey: string;
  name: string;
  category: CategoryId;
  quantity: number;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  purchaseDate: string; // YYYY-MM-DD
  expiryDate: string;   // YYYY-MM-DD
  storeName: string;
  receiptId?: string;
  dailyConsumptionRate?: number; // optional units per day for survivalist autonomy
}

export interface PriceRecord {
  id: string;
  productKey: string;
  productName: string;
  category: CategoryId;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  quantity: number;
  purchaseDate: string; // YYYY-MM-DD
  storeName: string;
  receiptId?: string;
}

export interface ReceiptItemSummary {
  name: string;
  productKey: string;
  category: CategoryId;
  quantity: number;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  totalPrice: number;
  expiryDate: string;
}

export interface ReceiptRecord {
  id: string;
  storeName: string;
  purchaseDate: string; // YYYY-MM-DD
  totalPaid: number;
  totalReference: number;
  netSavings: number;
  itemCount: number;
  source: 'ocr_photo' | 'local_text' | 'demo_seed';
  items: ReceiptItemSummary[];
  createdAt: string;
}

export interface ParsedDraftItem {
  tempId: string;
  name: string;
  category: CategoryId;
  quantity: number;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  expiryDate: string;
}

export interface AlertSettings {
  pushEnabled: boolean;
  warningDays: number; // e.g. 30 days before expiration
  criticalDays: number; // e.g. 7 days before expiration
  householdSize: number; // for survivalist reserve days calculation
}

export interface AppState {
  inventory: InventoryItem[];
  priceHistory: PriceRecord[];
  receipts: ReceiptRecord[];
  settings: AlertSettings;
}

export interface CategorySavingsSummary {
  category: CategoryId;
  totalSpent: number;
  totalReference: number;
  netSavings: number;
  savingsPercent: number;
  purchaseCount: number;
  activeStockUnits: number;
  activeStockValue: number;
}

export interface PriceTrendAnalysis {
  productKey: string;
  productName: string;
  category: CategoryId;
  unit: string;
  records: PriceRecord[];
  latestPrice: number;
  previousPrice: number | null;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  changeVsPreviousPct: number | null;
  changeVsAveragePct: number;
  signal: PriceSignal;
}

export interface DashboardKpis {
  totalSavings: number;
  totalSpent: number;
  savingsPercent: number;
  totalStockValue: number;
  totalUnits: number;
  uniqueProductsCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  belowAverageSharePct: number;
  survivalReserveDays: number;
}
