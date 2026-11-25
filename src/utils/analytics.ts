import {
  CATEGORIES,
  type CategoryId,
  type CategorySavingsSummary,
  type DashboardKpis,
  type ExpiryStatus,
  type InventoryItem,
  type MonthlyCategoryComparison,
  type MonthlyReportItem,
  type MonthlyReportSummary,
  type MonthlySeriesPoint,
  type ParsedDraftItem,
  type PriceRecord,
  type PriceSignal,
  type PriceTrendAnalysis,
  type ReceiptRecord,
} from '../types/inventory';

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTH_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function normalizeProductKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function addDaysToIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function hasValidExpiryDate(expiryDate?: string | null): boolean {
  if (!expiryDate || typeof expiryDate !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim());
}

export function calculateDaysUntilExpiry(
  expiryDate: string,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): number {
  if (!hasValidExpiryDate(expiryDate)) return Number.POSITIVE_INFINITY;
  const [ey, em, ed] = expiryDate.split('-').map(Number);
  const [ry, rm, rd] = referenceDate.split('-').map(Number);
  if (!ey || !em || !ed || !ry || !rm || !rd) return Number.POSITIVE_INFINITY;
  const expUtc = Date.UTC(ey, em - 1, ed);
  const refUtc = Date.UTC(ry, rm - 1, rd);
  return Math.round((expUtc - refUtc) / 86_400_000);
}

export function getExpiryStatus(
  expiryDate: string,
  warningDays: number = 30,
  criticalDays: number = 7,
  referenceDate?: string
): ExpiryStatus {
  if (!hasValidExpiryDate(expiryDate)) return 'none';
  const days = calculateDaysUntilExpiry(expiryDate, referenceDate);
  if (!Number.isFinite(days)) return 'none';
  if (days < 0) return 'expired';
  if (days <= criticalDays) return 'critical';
  if (days <= warningDays) return 'warning';
  return 'ok';
}

export function defaultIsStockpileForCategory(category: CategoryId): boolean {
  if (category === 'Hortifruti & Feira' || category === 'Padaria & Laticínios') {
    return false;
  }
  return true;
}

export function classifyPriceSignal(changeVsAveragePct: number): PriceSignal {
  if (changeVsAveragePct <= -5) return 'ideal_to_stock';
  if (changeVsAveragePct >= 5) return 'above_average';
  return 'stable';
}

export function analyzeProductPriceTrends(
  priceHistory: PriceRecord[]
): PriceTrendAnalysis[] {
  const grouped = new Map<string, PriceRecord[]>();
  for (const rec of priceHistory) {
    const key = rec.productKey || normalizeProductKey(rec.productName);
    const list = grouped.get(key) ?? [];
    list.push(rec);
    grouped.set(key, list);
  }

  const results: PriceTrendAnalysis[] = [];
  for (const [productKey, rawRecords] of grouped.entries()) {
    const records = [...rawRecords].sort((a, b) =>
      a.purchaseDate.localeCompare(b.purchaseDate)
    );
    const latest = records[records.length - 1];
    const previous = records.length > 1 ? records[records.length - 2] : null;
    const prices = records.map((r) => r.unitPrice);
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const averagePrice = Number((sum / prices.length).toFixed(2));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const changeVsPreviousPct =
      previous && previous.unitPrice > 0
        ? Number(
            (((latest.unitPrice - previous.unitPrice) / previous.unitPrice) * 100).toFixed(1)
          )
        : null;

    const baseline =
      records.length > 1
        ? averagePrice
        : latest.referencePrice > 0
          ? latest.referencePrice
          : averagePrice;

    const changeVsAveragePct =
      baseline > 0
        ? Number((((latest.unitPrice - baseline) / baseline) * 100).toFixed(1))
        : 0;

    results.push({
      productKey,
      productName: latest.productName,
      category: latest.category,
      unit: latest.unit,
      records,
      latestPrice: latest.unitPrice,
      previousPrice: previous ? previous.unitPrice : null,
      averagePrice,
      minPrice,
      maxPrice,
      changeVsPreviousPct,
      changeVsAveragePct,
      signal: classifyPriceSignal(changeVsAveragePct),
    });
  }

  return results.sort((a, b) => a.changeVsAveragePct - b.changeVsAveragePct);
}

export function calculateReceiptTotals(
  items: Array<{ quantity: number; unitPrice: number; referencePrice: number }>
): { totalPaid: number; totalReference: number; netSavings: number } {
  let totalPaid = 0;
  let totalReference = 0;
  for (const item of items) {
    const qty = Math.max(0, item.quantity);
    totalPaid += qty * item.unitPrice;
    const ref = item.referencePrice > 0 ? item.referencePrice : item.unitPrice;
    totalReference += qty * ref;
  }
  const roundedPaid = Number(totalPaid.toFixed(2));
  const roundedRef = Number(totalReference.toFixed(2));
  return {
    totalPaid: roundedPaid,
    totalReference: roundedRef,
    netSavings: Number((roundedRef - roundedPaid).toFixed(2)),
  };
}

export function calculateCategorySavings(
  priceHistory: PriceRecord[],
  inventory: InventoryItem[]
): CategorySavingsSummary[] {
  const byCategory = new Map<
    CategoryId,
    {
      totalSpent: number;
      totalReference: number;
      purchaseCount: number;
      activeStockUnits: number;
      activeStockValue: number;
    }
  >();

  for (const cat of CATEGORIES) {
    byCategory.set(cat, {
      totalSpent: 0,
      totalReference: 0,
      purchaseCount: 0,
      activeStockUnits: 0,
      activeStockValue: 0,
    });
  }

  for (const rec of priceHistory) {
    const bucket = byCategory.get(rec.category) ?? byCategory.get('Outros')!;
    const qty = Math.max(0, rec.quantity);
    const spent = qty * rec.unitPrice;
    const refUnit = rec.referencePrice > 0 ? rec.referencePrice : rec.unitPrice;
    const refTotal = qty * refUnit;
    bucket.totalSpent += spent;
    bucket.totalReference += refTotal;
    bucket.purchaseCount += 1;
  }

  for (const item of inventory) {
    if (item.quantity <= 0) continue;
    const bucket = byCategory.get(item.category) ?? byCategory.get('Outros')!;
    bucket.activeStockUnits += item.quantity;
    bucket.activeStockValue += item.quantity * item.unitPrice;
  }

  const summaries: CategorySavingsSummary[] = [];
  for (const [category, data] of byCategory.entries()) {
    const totalSpent = Number(data.totalSpent.toFixed(2));
    const totalReference = Number(data.totalReference.toFixed(2));
    const netSavings = Number((totalReference - totalSpent).toFixed(2));
    const savingsPercent =
      totalReference > 0
        ? Number(((netSavings / totalReference) * 100).toFixed(1))
        : 0;

    if (data.purchaseCount > 0 || data.activeStockUnits > 0) {
      summaries.push({
        category,
        totalSpent,
        totalReference,
        netSavings,
        savingsPercent,
        purchaseCount: data.purchaseCount,
        activeStockUnits: Number(data.activeStockUnits.toFixed(2)),
        activeStockValue: Number(data.activeStockValue.toFixed(2)),
      });
    }
  }

  return summaries.sort((a, b) => b.netSavings - a.netSavings);
}

export function calculateStockpileAutonomy(
  inventory: InventoryItem[],
  householdSize: number = 2,
  dailyCostPerPerson: number = 25
): {
  stockpileValue: number;
  stockpileUnits: number;
  stockpileProductsCount: number;
  survivalReserveDays: number;
  survivalDaysByBudget: number;
} {
  const stockpileItems = inventory.filter((item) => item.quantity > 0 && item.isStockpile);
  const stockpileValue = Number(
    stockpileItems
      .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      .toFixed(2)
  );
  const stockpileUnits = Number(
    stockpileItems.reduce((acc, item) => acc + item.quantity, 0).toFixed(1)
  );
  const uniqueKeys = new Set(stockpileItems.map((i) => i.productKey));

  const foodUnits = stockpileItems
    .filter(
      (i) =>
        i.category === 'Grãos & Secos' ||
        i.category === 'Proteínas & Enlatados' ||
        i.category === 'Água & Bebidas' ||
        i.category === 'Óleos & Temperos' ||
        i.category === 'Hortifruti & Feira' ||
        i.category === 'Padaria & Laticínios'
    )
    .reduce((acc, item) => {
      const unitLower = item.unit.toLowerCase();
      const weight =
        unitLower === 'kg'
          ? 3
          : item.category === 'Grãos & Secos'
            ? 4
            : item.category === 'Proteínas & Enlatados'
              ? 1.5
              : 1;
      return acc + item.quantity * weight;
    }, 0);

  const safePeople = Math.max(1, householdSize);
  const safeDailyCost = Math.max(1, dailyCostPerPerson);
  const survivalReserveDays = Math.round(foodUnits / (safePeople * 1.1));
  const survivalDaysByBudget =
    stockpileValue > 0 ? Math.round(stockpileValue / (safePeople * safeDailyCost)) : 0;

  return {
    stockpileValue,
    stockpileUnits,
    stockpileProductsCount: uniqueKeys.size,
    survivalReserveDays,
    survivalDaysByBudget,
  };
}

export function calculateDashboardKpis(
  inventory: InventoryItem[],
  receipts: ReceiptRecord[],
  priceHistory: PriceRecord[],
  warningDays: number = 30,
  criticalDays: number = 7,
  householdSize: number = 2,
  referenceDate?: string,
  dailyCostPerPerson: number = 25
): DashboardKpis {
  let totalSpent = 0;
  let totalReference = 0;

  if (priceHistory.length > 0) {
    for (const rec of priceHistory) {
      const qty = Math.max(0, rec.quantity);
      totalSpent += qty * rec.unitPrice;
      const ref = rec.referencePrice > 0 ? rec.referencePrice : rec.unitPrice;
      totalReference += qty * ref;
    }
  } else {
    for (const r of receipts) {
      totalSpent += r.totalPaid;
      totalReference += r.totalReference;
    }
  }

  const totalSavings = Number((totalReference - totalSpent).toFixed(2));
  const roundedSpent = Number(totalSpent.toFixed(2));
  const savingsPercent =
    totalReference > 0
      ? Number(((totalSavings / totalReference) * 100).toFixed(1))
      : 0;

  const activeItems = inventory.filter((item) => item.quantity > 0);
  const totalStockValue = Number(
    activeItems
      .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      .toFixed(2)
  );
  const totalUnits = Number(
    activeItems.reduce((acc, item) => acc + item.quantity, 0).toFixed(1)
  );

  const routineItems = activeItems.filter((item) => !item.isStockpile);
  const routineValue = Number(
    routineItems
      .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      .toFixed(2)
  );
  const routineUnits = Number(
    routineItems.reduce((acc, item) => acc + item.quantity, 0).toFixed(1)
  );
  const routineKeys = new Set(routineItems.map((i) => i.productKey));

  const stockpile = calculateStockpileAutonomy(
    activeItems,
    householdSize,
    dailyCostPerPerson
  );

  let expiringSoonCount = 0;
  let expiredCount = 0;
  const uniqueKeys = new Set<string>();

  for (const item of activeItems) {
    uniqueKeys.add(item.productKey);
    const status = getExpiryStatus(
      item.expiryDate,
      warningDays,
      criticalDays,
      referenceDate
    );
    if (status === 'expired') expiredCount += 1;
    else if (status === 'critical' || status === 'warning') expiringSoonCount += 1;
  }

  const trends = analyzeProductPriceTrends(priceHistory);
  const belowOrStable = trends.filter(
    (t) => t.signal === 'ideal_to_stock' || t.latestPrice <= t.averagePrice
  ).length;
  const belowAverageSharePct =
    trends.length > 0 ? Math.round((belowOrStable / trends.length) * 100) : 0;

  return {
    totalSavings,
    totalSpent: roundedSpent,
    savingsPercent,
    totalStockValue,
    totalUnits,
    uniqueProductsCount: uniqueKeys.size,
    stockpileValue: stockpile.stockpileValue,
    stockpileUnits: stockpile.stockpileUnits,
    stockpileProductsCount: stockpile.stockpileProductsCount,
    routineValue,
    routineUnits,
    routineProductsCount: routineKeys.size,
    expiringSoonCount,
    expiredCount,
    belowAverageSharePct,
    survivalReserveDays: stockpile.survivalReserveDays,
    survivalDaysByBudget: stockpile.survivalDaysByBudget,
  };
}

export function inferCategoryFromName(name: string): CategoryId {
  const n = normalizeProductKey(name);
  if (
    /(tomate|banana|alface|cebola|batata|maca|laranja|limao|cenoura|abobora|abobrinha|pepino|pimentao|mamao|melancia|uva|morango|brocolis|couve|cheiro verde|coentro|salsa|verdura|fruta|legume|hortifruti|feira|mandioca|inhame|beterraba|manga|abacaxi|pera|abacate)/.test(
      n
    )
  ) {
    return 'Hortifruti & Feira';
  }
  if (
    /(pao|padaria|queijo|mussarela|prato|manteiga|margarina|iogurte|requeijao|leite|presunto|peito de peru|biscoito|bolo|torrada|creme de leite|leite condensado|nata|ricota)/.test(
      n
    )
  ) {
    return 'Padaria & Laticínios';
  }
  if (/(arroz|feijao|macarrao|lentilha|aveia|farinha|acucar|cafe|grao|milho|fuba|sal|granola|cuscuz|tapioca)/.test(n)) {
    return 'Grãos & Secos';
  }
  if (/(sardinha|atum|carne|frango|ovo|proteina|enlatad|charque|ervilha|peixe|bife|patinho|acem|linguica|bacon|salsicha)/.test(n)) {
    return 'Proteínas & Enlatados';
  }
  if (/(agua mineral|agua com gas|agua|suco|cha|isotonic|bebida|refrigerante|cerveja|vinho)/.test(n)) {
    if (/(sanitaria|cloro)/.test(n)) return 'Higiene & Limpeza';
    return 'Água & Bebidas';
  }
  if (/(oleo|azeite|vinagre|tempero|alho|extrato|molho|shoyu|ketchup|maionese|mostarda|oregano|pimenta)/.test(n)) {
    return 'Óleos & Temperos';
  }
  if (/(sabao|detergente|alcool|papel|higiene|pasta|sabonete|agua sanitaria|cloro|desinfetante|amaciante|shampoo|condicionador|esponja|lixo)/.test(n)) {
    return 'Higiene & Limpeza';
  }
  if (/(pilha|bateria|vela|gas|fosforo|curativo|gaze|remedio|energia|lanterna|isqueiro)/.test(n)) {
    return 'Primeiros Socorros & Energia';
  }
  return 'Outros';
}

export function inferShelfLifeDays(category: CategoryId): number {
  switch (category) {
    case 'Hortifruti & Feira':
      return 7;
    case 'Padaria & Laticínios':
      return 14;
    case 'Grãos & Secos':
      return 365;
    case 'Proteínas & Enlatados':
      return 730;
    case 'Água & Bebidas':
      return 365;
    case 'Óleos & Temperos':
      return 365;
    case 'Higiene & Limpeza':
      return 1095;
    case 'Primeiros Socorros & Energia':
      return 1095;
    default:
      return 180;
  }
}

export function parseRawReceiptTextLocally(
  rawText: string,
  purchaseDate: string = new Date().toISOString().slice(0, 10),
  existingTrends: PriceTrendAnalysis[] = []
): { storeName: string; purchaseDate: string; items: ParsedDraftItem[] } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let storeName = 'Mercado Local';
  let detectedDate = purchaseDate;
  const items: ParsedDraftItem[] = [];

  const trendMap = new Map<string, PriceTrendAnalysis>();
  for (const t of existingTrends) {
    trendMap.set(t.productKey, t);
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    const dateMatch = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dateMatch) {
      detectedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      continue;
    }

    if (
      idx === 0 &&
      !/\d+[.,]\d{2}/.test(line) &&
      line.length >= 3 &&
      line.length <= 60
    ) {
      storeName = line;
      continue;
    }

    const pipeParts = line.split('|').map((p) => p.trim());
    if (pipeParts.length >= 3) {
      const name = pipeParts[0];
      const qty = parseFloat(pipeParts[1].replace(',', '.')) || 1;
      const hasUnit = pipeParts.length >= 4;
      const unit = hasUnit ? pipeParts[2] : 'un';
      const priceStr = (hasUnit ? pipeParts[3] : pipeParts[2]).replace(',', '.');
      const unitPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      if (name && unitPrice > 0) {
        const category = inferCategoryFromName(name);
        const key = normalizeProductKey(name);
        const trend = trendMap.get(key);
        items.push({
          tempId: `local-${idx}-${Date.now()}`,
          name,
          category,
          quantity: qty,
          unit,
          unitPrice,
          referencePrice: trend ? trend.averagePrice : unitPrice,
          expiryDate: '',
          isStockpile: defaultIsStockpileForCategory(category),
          suggestedShelfLifeDays: inferShelfLifeDays(category),
        });
      }
      continue;
    }

    const regexMatch = line.match(
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(un|kg|l|pct|lata|cx|bdj|dz)?\s*[x×]\s*R?\$?\s*(\d+[.,]\d{2})(?:\s*=.*)?$/i
    );
    if (regexMatch) {
      const name = regexMatch[1].trim();
      const qty = parseFloat(regexMatch[2].replace(',', '.')) || 1;
      const unit = (regexMatch[3] || 'un').toLowerCase();
      const unitPrice = parseFloat(regexMatch[4].replace(',', '.')) || 0;
      if (name && unitPrice > 0) {
        const category = inferCategoryFromName(name);
        const key = normalizeProductKey(name);
        const trend = trendMap.get(key);
        items.push({
          tempId: `local-${idx}-${Date.now()}`,
          name,
          category,
          quantity: qty,
          unit,
          unitPrice,
          referencePrice: trend ? trend.averagePrice : unitPrice,
          expiryDate: '',
          isStockpile: defaultIsStockpileForCategory(category),
          suggestedShelfLifeDays: inferShelfLifeDays(category),
        });
      }
      continue;
    }

    const simplePriceMatch = line.match(/^(.+?)\s+R?\$?\s*(\d+[.,]\d{2})$/i);
    if (simplePriceMatch) {
      const name = simplePriceMatch[1].trim();
      const unitPrice = parseFloat(simplePriceMatch[2].replace(',', '.')) || 0;
      if (name && unitPrice > 0 && !/total|subtotal|troco|desconto/i.test(name)) {
        const category = inferCategoryFromName(name);
        const key = normalizeProductKey(name);
        const trend = trendMap.get(key);
        items.push({
          tempId: `local-${idx}-${Date.now()}`,
          name,
          category,
          quantity: 1,
          unit: 'un',
          unitPrice,
          referencePrice: trend ? trend.averagePrice : unitPrice,
          expiryDate: '',
          isStockpile: defaultIsStockpileForCategory(category),
          suggestedShelfLifeDays: inferShelfLifeDays(category),
        });
      }
    }
  }

  return { storeName, purchaseDate: detectedDate, items };
}

export function getPreviousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabelBR(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_NAMES_PT[m - 1]} ${y}`;
}

export function formatMonthShortBR(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_SHORT_PT[m - 1]}/${String(y).slice(-2)}`;
}

export function getAvailableMonths(
  priceHistory: PriceRecord[],
  receipts: ReceiptRecord[],
  fallbackTodayIso: string = new Date().toISOString().slice(0, 10)
): string[] {
  const set = new Set<string>();
  for (const p of priceHistory) {
    if (p.purchaseDate && p.purchaseDate.length >= 7) {
      set.add(p.purchaseDate.slice(0, 7));
    }
  }
  for (const r of receipts) {
    if (r.purchaseDate && r.purchaseDate.length >= 7) {
      set.add(r.purchaseDate.slice(0, 7));
    }
  }
  if (set.size === 0) {
    set.add(fallbackTodayIso.slice(0, 7));
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export function buildMonthlyReport(
  priceHistory: PriceRecord[],
  receipts: ReceiptRecord[],
  monthKey: string,
  compareMonthKey: string = getPreviousMonthKey(monthKey)
): MonthlyReportSummary {
  const currentRecords = priceHistory.filter((r) => r.purchaseDate.startsWith(monthKey));
  const compareRecords = priceHistory.filter((r) => r.purchaseDate.startsWith(compareMonthKey));
  const monthReceipts = receipts.filter((r) => r.purchaseDate.startsWith(monthKey));

  const catMap = new Map<
    CategoryId,
    {
      currentSpent: number;
      stockpileSpent: number;
      routineSpent: number;
      currentReference: number;
      compareSpent: number;
      itemCount: number;
    }
  >();

  for (const cat of CATEGORIES) {
    catMap.set(cat, {
      currentSpent: 0,
      stockpileSpent: 0,
      routineSpent: 0,
      currentReference: 0,
      compareSpent: 0,
      itemCount: 0,
    });
  }

  let totalSpent = 0;
  let stockpileSpent = 0;
  let routineSpent = 0;
  let totalReference = 0;
  const items: MonthlyReportItem[] = [];

  for (const rec of currentRecords) {
    const qty = Math.max(0, rec.quantity);
    const paid = Number((qty * rec.unitPrice).toFixed(2));
    const refUnit = rec.referencePrice > 0 ? rec.referencePrice : rec.unitPrice;
    const refTotal = Number((qty * refUnit).toFixed(2));
    const isStockpile = rec.isStockpile ?? defaultIsStockpileForCategory(rec.category);

    totalSpent += paid;
    totalReference += refTotal;
    if (isStockpile) stockpileSpent += paid;
    else routineSpent += paid;

    const bucket = catMap.get(rec.category) ?? catMap.get('Outros')!;
    bucket.currentSpent += paid;
    if (isStockpile) bucket.stockpileSpent += paid;
    else bucket.routineSpent += paid;
    bucket.currentReference += refTotal;
    bucket.itemCount += 1;

    items.push({
      id: rec.id,
      name: rec.productName,
      category: rec.category,
      quantity: qty,
      unit: rec.unit,
      unitPrice: rec.unitPrice,
      referencePrice: refUnit,
      totalPaid: paid,
      netSavings: Number((refTotal - paid).toFixed(2)),
      purchaseDate: rec.purchaseDate,
      storeName: rec.storeName,
      isStockpile,
    });
  }

  let compareTotalSpent = 0;
  for (const rec of compareRecords) {
    const qty = Math.max(0, rec.quantity);
    const paid = Number((qty * rec.unitPrice).toFixed(2));
    compareTotalSpent += paid;
    const bucket = catMap.get(rec.category) ?? catMap.get('Outros')!;
    bucket.compareSpent += paid;
  }

  const roundedSpent = Number(totalSpent.toFixed(2));
  const roundedStockpile = Number(stockpileSpent.toFixed(2));
  const roundedRoutine = Number(routineSpent.toFixed(2));
  const roundedRef = Number(totalReference.toFixed(2));
  const netSavings = Number((roundedRef - roundedSpent).toFixed(2));
  const savingsPercent =
    roundedRef > 0 ? Number(((netSavings / roundedRef) * 100).toFixed(1)) : 0;

  const roundedCompare = Number(compareTotalSpent.toFixed(2));
  const compareDiffAmount = Number((roundedSpent - roundedCompare).toFixed(2));
  const compareDiffPercent =
    roundedCompare > 0
      ? Number((((roundedSpent - roundedCompare) / roundedCompare) * 100).toFixed(1))
      : null;

  const stockpileSharePct =
    roundedSpent > 0 ? Number(((roundedStockpile / roundedSpent) * 100).toFixed(1)) : 0;
  const routineSharePct =
    roundedSpent > 0 ? Number(((roundedRoutine / roundedSpent) * 100).toFixed(1)) : 0;

  const categories: MonthlyCategoryComparison[] = [];
  for (const [category, data] of catMap.entries()) {
    if (data.currentSpent <= 0 && data.compareSpent <= 0) continue;
    const curSpent = Number(data.currentSpent.toFixed(2));
    const cmpSpent = Number(data.compareSpent.toFixed(2));
    const curRef = Number(data.currentReference.toFixed(2));
    const diffAmount = Number((curSpent - cmpSpent).toFixed(2));
    const diffPercent =
      cmpSpent > 0 ? Number((((curSpent - cmpSpent) / cmpSpent) * 100).toFixed(1)) : null;

    categories.push({
      category,
      currentSpent: curSpent,
      stockpileSpent: Number(data.stockpileSpent.toFixed(2)),
      routineSpent: Number(data.routineSpent.toFixed(2)),
      currentReference: curRef,
      netSavings: Number((curRef - curSpent).toFixed(2)),
      compareSpent: cmpSpent,
      diffAmount,
      diffPercent,
      itemCount: data.itemCount,
    });
  }

  categories.sort((a, b) => b.currentSpent - a.currentSpent);
  items.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.totalPaid - a.totalPaid);

  return {
    monthKey,
    compareMonthKey,
    totalSpent: roundedSpent,
    stockpileSpent: roundedStockpile,
    routineSpent: roundedRoutine,
    stockpileSharePct,
    routineSharePct,
    totalReference: roundedRef,
    netSavings,
    savingsPercent,
    compareTotalSpent: roundedCompare,
    compareDiffAmount,
    compareDiffPercent,
    receiptCount: monthReceipts.length,
    itemCount: items.length,
    categories,
    items,
  };
}

export function buildMonthlyTrendSeries(
  priceHistory: PriceRecord[],
  endMonthKey: string,
  monthsCount: number = 6
): MonthlySeriesPoint[] {
  const points: MonthlySeriesPoint[] = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const mk = shiftMonthKey(endMonthKey, -i);
    let stockpileSpent = 0;
    let routineSpent = 0;
    let totalRef = 0;

    for (const rec of priceHistory) {
      if (!rec.purchaseDate.startsWith(mk)) continue;
      const qty = Math.max(0, rec.quantity);
      const paid = qty * rec.unitPrice;
      const refUnit = rec.referencePrice > 0 ? rec.referencePrice : rec.unitPrice;
      totalRef += qty * refUnit;
      const isStockpile = rec.isStockpile ?? defaultIsStockpileForCategory(rec.category);
      if (isStockpile) stockpileSpent += paid;
      else routineSpent += paid;
    }

    const sp = Number(stockpileSpent.toFixed(2));
    const rt = Number(routineSpent.toFixed(2));
    const tot = Number((sp + rt).toFixed(2));

    points.push({
      monthKey: mk,
      label: formatMonthShortBR(mk),
      stockpileSpent: sp,
      routineSpent: rt,
      totalSpent: tot,
      netSavings: Number((totalRef - tot).toFixed(2)),
    });
  }
  return points;
}

export function exportMonthlyReportCsv(report: MonthlyReportSummary): string {
  const escape = (val: string | number) => {
    const str = String(val);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];
  lines.push(
    [
      'Data Compra',
      'Produto',
      'Categoria',
      'Destino',
      'Mercado',
      'Quantidade',
      'Unidade',
      'Preco Unitario (BRL)',
      'Ref. Mercado (BRL)',
      'Total Pago (BRL)',
      'Economia vs Ref (BRL)',
    ].join(';')
  );

  for (const item of report.items) {
    lines.push(
      [
        formatDateBR(item.purchaseDate),
        item.name,
        item.category,
        item.isStockpile ? 'Estocada' : 'Uso Diario (Rotineira)',
        item.storeName,
        item.quantity.toString().replace('.', ','),
        item.unit,
        item.unitPrice.toFixed(2).replace('.', ','),
        item.referencePrice.toFixed(2).replace('.', ','),
        item.totalPaid.toFixed(2).replace('.', ','),
        item.netSavings.toFixed(2).replace('.', ','),
      ]
        .map(escape)
        .join(';')
    );
  }

  return `\uFEFF${lines.join('\n')}`;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return 'Sem data';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}
