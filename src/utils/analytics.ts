import {
  CATEGORIES,
  type CategoryId,
  type CategorySavingsSummary,
  type DashboardKpis,
  type ExpiryStatus,
  type InventoryItem,
  type ParsedDraftItem,
  type PriceRecord,
  type PriceSignal,
  type PriceTrendAnalysis,
  type ReceiptRecord,
} from '../types/inventory';

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

export function calculateDaysUntilExpiry(
  expiryDate: string,
  referenceDate: string = new Date().toISOString().slice(0, 10)
): number {
  const [ey, em, ed] = expiryDate.split('-').map(Number);
  const [ry, rm, rd] = referenceDate.split('-').map(Number);
  if (!ey || !em || !ed || !ry || !rm || !rd) return 0;
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
  const days = calculateDaysUntilExpiry(expiryDate, referenceDate);
  if (days < 0) return 'expired';
  if (days <= criticalDays) return 'critical';
  if (days <= warningDays) return 'warning';
  return 'ok';
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

export function calculateDashboardKpis(
  inventory: InventoryItem[],
  receipts: ReceiptRecord[],
  priceHistory: PriceRecord[],
  warningDays: number = 30,
  criticalDays: number = 7,
  householdSize: number = 2,
  referenceDate?: string
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

  // Survivalist autonomy estimate: food/water categories weighted by household size
  const foodUnits = activeItems
    .filter(
      (i) =>
        i.category === 'Grãos & Secos' ||
        i.category === 'Proteínas & Enlatados' ||
        i.category === 'Água & Bebidas' ||
        i.category === 'Óleos & Temperos'
    )
    .reduce((acc, item) => {
      const weight =
        item.unit.toLowerCase() === 'kg'
          ? 3
          : item.category === 'Grãos & Secos'
            ? 4
            : item.category === 'Proteínas & Enlatados'
              ? 1.5
              : 1;
      return acc + item.quantity * weight;
    }, 0);

  const safePeople = Math.max(1, householdSize);
  const survivalReserveDays = Math.round(foodUnits / (safePeople * 1.1));

  return {
    totalSavings,
    totalSpent: roundedSpent,
    savingsPercent,
    totalStockValue,
    totalUnits,
    uniqueProductsCount: uniqueKeys.size,
    expiringSoonCount,
    expiredCount,
    belowAverageSharePct,
    survivalReserveDays,
  };
}

export function inferCategoryFromName(name: string): CategoryId {
  const n = normalizeProductKey(name);
  if (/(arroz|feijao|macarrao|lentilha|aveia|farinha|acucar|cafe|grao|milho|fuba|sal)/.test(n)) {
    return 'Grãos & Secos';
  }
  if (/(sardinha|atum|carne|frango|ovo|leite|proteina|enlatad|charque|ervilha)/.test(n)) {
    return 'Proteínas & Enlatados';
  }
  if (/(agua|suco|cha|isotonic|bebida)/.test(n)) {
    return 'Água & Bebidas';
  }
  if (/(oleo|azeite|vinagre|tempero|alho|extrato|molho)/.test(n)) {
    return 'Óleos & Temperos';
  }
  if (/(sabao|detergente|alcool|papel|higiene|pasta|sabonete|agua sanitaria|cloro)/.test(n)) {
    return 'Higiene & Limpeza';
  }
  if (/(pilha|bateria|vela|gas|fosforo|curativo|gaze|remedio|energia|lanterna)/.test(n)) {
    return 'Primeiros Socorros & Energia';
  }
  return 'Outros';
}

export function inferShelfLifeDays(category: CategoryId): number {
  switch (category) {
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

    // Match patterns like:
    // "ARROZ BRANCO 5KG 2 UN x 24,90"
    // "FEIJAO CARIOCA 1KG | 3 | un | 7.50"
    // "SARDINHA LATA 125G 4x 5,90"
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
          expiryDate: addDaysToIso(detectedDate, inferShelfLifeDays(category)),
        });
      }
      continue;
    }

    const regexMatch = line.match(
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(un|kg|l|pct|lata|cx)?\s*[x×]\s*R?\$?\s*(\d+[.,]\d{2})(?:\s*=.*)?$/i
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
          expiryDate: addDaysToIso(detectedDate, inferShelfLifeDays(category)),
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
          expiryDate: addDaysToIso(detectedDate, inferShelfLifeDays(category)),
        });
      }
    }
  }

  return { storeName, purchaseDate: detectedDate, items };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}
