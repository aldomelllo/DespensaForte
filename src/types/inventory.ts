export type CategoryId =
  | 'Hortifruti & Feira'
  | 'Padaria & Laticínios'
  | 'Grãos & Secos'
  | 'Proteínas & Enlatados'
  | 'Água & Bebidas'
  | 'Óleos & Temperos'
  | 'Higiene & Limpeza'
  | 'Primeiros Socorros & Energia'
  | 'Outros';

export const CATEGORIES: CategoryId[] = [
  'Hortifruti & Feira',
  'Padaria & Laticínios',
  'Grãos & Secos',
  'Proteínas & Enlatados',
  'Água & Bebidas',
  'Óleos & Temperos',
  'Higiene & Limpeza',
  'Primeiros Socorros & Energia',
  'Outros',
];

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok' | 'none';

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
  insertedAt?: string;  // YYYY-MM-DD (data em que foi lançado no app)
  expiryDate: string;   // YYYY-MM-DD ou '' quando não informado
  storeName: string;
  receiptId?: string;
  isStockpile: boolean; // true = Despensa Estocada (reserva), false = Despensa Rotineira (uso diário/feira)
  dailyConsumptionRate?: number;
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
  insertedAt?: string;  // YYYY-MM-DD
  storeName: string;
  receiptId?: string;
  isStockpile?: boolean;
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
  expiryDate: string; // YYYY-MM-DD ou ''
  isStockpile?: boolean;
}

export interface ReceiptRecord {
  id: string;
  storeName: string;
  purchaseDate: string; // YYYY-MM-DD (data real da compra)
  totalPaid: number;
  totalReference: number;
  netSavings: number;
  itemCount: number;
  source: 'ocr_photo' | 'local_text' | 'demo_seed';
  items: ReceiptItemSummary[];
  createdAt: string;    // YYYY-MM-DD (data de inserção)
  insertedAt?: string;  // YYYY-MM-DD (alias explícito para data de inserção)
}

export interface ParsedDraftItem {
  tempId: string;
  name: string;
  category: CategoryId;
  quantity: number;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  expiryDate: string; // Inicia sempre vazio (''), preenchido apenas sob demanda ou manualmente
  isStockpile: boolean;
  suggestedShelfLifeDays?: number;
}

export interface AlertSettings {
  pushEnabled: boolean;
  warningDays: number;        // e.g. 30 days before expiration
  criticalDays: number;       // e.g. 7 days before expiration
  householdSize: number;      // pessoas na casa
  dailyCostPerPerson: number; // custo diário estimado por pessoa (R$) para autonomia por valor investido
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
  // Separação Despensa Estocada vs Rotineira
  stockpileValue: number;
  stockpileUnits: number;
  stockpileProductsCount: number;
  routineValue: number;
  routineUnits: number;
  routineProductsCount: number;
  // Alertas
  expiringSoonCount: number;
  expiredCount: number;
  belowAverageSharePct: number;
  // Autonomia calculada APENAS sobre itens estocados (isStockpile === true)
  survivalReserveDays: number;   // por volume alimentar estocado
  survivalDaysByBudget: number;  // pelo valor investido / (pessoas * custo diário)
}

export interface MonthlyCategoryComparison {
  category: CategoryId;
  currentSpent: number;
  stockpileSpent: number;
  routineSpent: number;
  currentReference: number;
  netSavings: number;
  compareSpent: number;
  diffAmount: number;
  diffPercent: number | null;
  itemCount: number;
}

export interface MonthlyReportItem {
  id: string;
  name: string;
  category: CategoryId;
  quantity: number;
  unit: string;
  unitPrice: number;
  referencePrice: number;
  totalPaid: number;
  netSavings: number;
  purchaseDate: string;
  storeName: string;
  isStockpile: boolean;
}

export interface MonthlySeriesPoint {
  monthKey: string; // YYYY-MM
  label: string;    // ex: Nov/26
  stockpileSpent: number;
  routineSpent: number;
  totalSpent: number;
  netSavings: number;
}

export interface MonthlyReportSummary {
  monthKey: string;
  compareMonthKey: string;
  totalSpent: number;
  stockpileSpent: number;
  routineSpent: number;
  stockpileSharePct: number;
  routineSharePct: number;
  totalReference: number;
  netSavings: number;
  savingsPercent: number;
  compareTotalSpent: number;
  compareDiffAmount: number;
  compareDiffPercent: number | null;
  receiptCount: number;
  itemCount: number;
  categories: MonthlyCategoryComparison[];
  items: MonthlyReportItem[];
}

export interface SharedMonthlyReportPayload {
  version: 1;
  generatedAt: string;
  report: MonthlyReportSummary;
  series: MonthlySeriesPoint[];
}
