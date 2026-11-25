import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeProductPriceTrends,
  buildMonthlyReport,
  buildMonthlyTrendSeries,
  calculateCategorySavings,
  calculateDashboardKpis,
  calculateDaysUntilExpiry,
  calculateReceiptTotals,
  calculateStockpileAutonomy,
  exportMonthlyReportCsv,
  getExpiryStatus,
  inferCategoryFromName,
  normalizeProductKey,
  parseRawReceiptTextLocally,
} from './analytics';
import { createDemoScannedReceipt } from '../data/seedData';
import { decodeSharedReportFromHash, encodeSharedReport } from './shareReport';
import {
  CATEGORIES,
  type InventoryItem,
  type PriceRecord,
  type ReceiptRecord,
  type SharedMonthlyReportPayload,
} from '../types/inventory';

test('CATEGORIES includes Hortifruti & Feira, Padaria & Laticínios, and all 7 original categories', () => {
  assert.equal(CATEGORIES.length, 9);
  assert.ok(CATEGORIES.includes('Hortifruti & Feira'));
  assert.ok(CATEGORIES.includes('Padaria & Laticínios'));
  assert.ok(CATEGORIES.includes('Grãos & Secos'));
  assert.ok(CATEGORIES.includes('Proteínas & Enlatados'));
  assert.ok(CATEGORIES.includes('Água & Bebidas'));
  assert.ok(CATEGORIES.includes('Óleos & Temperos'));
  assert.ok(CATEGORIES.includes('Higiene & Limpeza'));
  assert.ok(CATEGORIES.includes('Primeiros Socorros & Energia'));
  assert.ok(CATEGORIES.includes('Outros'));

  assert.equal(inferCategoryFromName('Tomate Italiano kg'), 'Hortifruti & Feira');
  assert.equal(inferCategoryFromName('Banana Prata'), 'Hortifruti & Feira');
  assert.equal(inferCategoryFromName('Queijo Mussarela 300g'), 'Padaria & Laticínios');
  assert.equal(inferCategoryFromName('Pão de Forma Integral'), 'Padaria & Laticínios');
});

test('normalizeProductKey removes accents, punctuation and normalizes whitespace', () => {
  assert.equal(normalizeProductKey('Feijão Carioca 1kg!'), 'feijao carioca 1kg');
  assert.equal(normalizeProductKey('  Óleo   de Soja 900ml '), 'oleo de soja 900ml');
});

test('expiry days and status classify expired, critical, warning, ok, and empty (none) without false alerts', () => {
  assert.equal(calculateDaysUntilExpiry('2026-11-10', '2026-11-17'), -7);
  assert.equal(getExpiryStatus('2026-11-10', 30, 7, '2026-11-17'), 'expired');
  assert.equal(getExpiryStatus('2026-11-22', 30, 7, '2026-11-17'), 'critical');
  assert.equal(getExpiryStatus('2026-12-05', 30, 7, '2026-11-17'), 'warning');
  assert.equal(getExpiryStatus('2027-06-01', 30, 7, '2026-11-17'), 'ok');
  assert.equal(getExpiryStatus('', 30, 7, '2026-11-17'), 'none');
  assert.equal(calculateDaysUntilExpiry('', '2026-11-17'), Number.POSITIVE_INFINITY);
});

test('analyzeProductPriceTrends detects price regression (ideal to stock) and inflation', () => {
  const records: PriceRecord[] = [
    {
      id: '1',
      productKey: 'arroz branco 5kg',
      productName: 'Arroz Branco 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 32.0,
      referencePrice: 32.0,
      quantity: 2,
      purchaseDate: '2026-08-10',
      storeName: 'Atacadão',
      isStockpile: true,
    },
    {
      id: '2',
      productKey: 'arroz branco 5kg',
      productName: 'Arroz Branco 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 28.0,
      referencePrice: 30.0,
      quantity: 2,
      purchaseDate: '2026-09-15',
      storeName: 'Assaí',
      isStockpile: true,
    },
    {
      id: '3',
      productKey: 'arroz branco 5kg',
      productName: 'Arroz Branco 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 24.0,
      referencePrice: 30.0,
      quantity: 4,
      purchaseDate: '2026-11-01',
      storeName: 'Atacadão',
      isStockpile: true,
    },
  ];

  const trends = analyzeProductPriceTrends(records);
  assert.equal(trends.length, 1);
  const arroz = trends[0];
  assert.equal(arroz.latestPrice, 24.0);
  assert.equal(arroz.previousPrice, 28.0);
  assert.equal(arroz.averagePrice, 28.0);
  assert.equal(arroz.minPrice, 24.0);
  assert.equal(arroz.maxPrice, 32.0);
  assert.equal(arroz.signal, 'ideal_to_stock');
  assert.ok(arroz.changeVsAveragePct < -10);
});

test('calculateReceiptTotals, calculateCategorySavings and stockpile-only autonomy work accurately', () => {
  const totals = calculateReceiptTotals([
    { quantity: 3, unitPrice: 24.0, referencePrice: 29.0 },
    { quantity: 2, unitPrice: 8.5, referencePrice: 8.0 },
  ]);
  assert.equal(totals.totalPaid, 89.0);
  assert.equal(totals.totalReference, 103.0);
  assert.equal(totals.netSavings, 14.0);

  const history: PriceRecord[] = [
    {
      id: 'p1',
      productKey: 'arroz 5kg',
      productName: 'Arroz 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 24.0,
      referencePrice: 29.0,
      quantity: 3,
      purchaseDate: '2026-11-01',
      storeName: 'Atacadão',
      isStockpile: true,
    },
    {
      id: 'p2',
      productKey: 'sardinha lata',
      productName: 'Sardinha Lata',
      category: 'Proteínas & Enlatados',
      unit: 'lata',
      unitPrice: 5.5,
      referencePrice: 6.5,
      quantity: 10,
      purchaseDate: '2026-11-01',
      storeName: 'Atacadão',
      isStockpile: true,
    },
  ];

  const inventory: InventoryItem[] = [
    {
      id: 'i1',
      productKey: 'arroz 5kg',
      name: 'Arroz 5kg',
      category: 'Grãos & Secos',
      quantity: 10,
      unit: 'pct',
      unitPrice: 25.0,
      referencePrice: 29.0,
      purchaseDate: '2026-11-01',
      expiryDate: '2027-11-01',
      storeName: 'Atacadão',
      isStockpile: true,
    },
    {
      id: 'i2',
      productKey: 'tomate kg',
      name: 'Tomate kg',
      category: 'Hortifruti & Feira',
      quantity: 20,
      unit: 'kg',
      unitPrice: 10.0,
      referencePrice: 12.0,
      purchaseDate: '2026-11-15',
      expiryDate: '', // vazio não gera falso alerta
      storeName: 'Feira',
      isStockpile: false, // Rotineira: NÃO deve entrar na autonomia da reserva
    },
  ];

  const categories = calculateCategorySavings(history, inventory);
  const graos = categories.find((c) => c.category === 'Grãos & Secos');
  const proteinas = categories.find((c) => c.category === 'Proteínas & Enlatados');
  assert.equal(graos?.netSavings, 15.0);
  assert.equal(proteinas?.netSavings, 10.0);

  // 10 * 25 = R$ 250 estocado; 2 pessoas * R$ 25/dia = R$ 50/dia -> 5 dias por valor investido
  // Tomate (R$ 200 rotineira) não pode inflar survivalDaysByBudget nem survivalReserveDays
  const autonomy = calculateStockpileAutonomy(inventory, 2, 25);
  assert.equal(autonomy.stockpileValue, 250);
  assert.equal(autonomy.survivalDaysByBudget, 5);

  const kpis = calculateDashboardKpis(
    inventory,
    [] as ReceiptRecord[],
    history,
    30,
    7,
    2,
    '2026-11-17',
    25
  );
  assert.equal(kpis.totalSavings, 25.0);
  assert.equal(kpis.totalStockValue, 450.0);
  assert.equal(kpis.stockpileValue, 250.0);
  assert.equal(kpis.routineValue, 200.0);
  assert.equal(kpis.survivalDaysByBudget, 5);
  assert.equal(kpis.expiringSoonCount, 0);
  assert.equal(kpis.expiredCount, 0);
});

test('parseRawReceiptTextLocally and createDemoScannedReceipt leave expiryDate empty by default', () => {
  const sample = [
    'Supermercado Atacarejo Central',
    '15/11/2026',
    'ARROZ BRANCO 5KG 2 pct x 23,90',
    'TOMATE ITALIANO 2 kg x 6,90',
    'AGUA MINERAL 5L | 4 | un | 8,50',
  ].join('\n');

  const parsed = parseRawReceiptTextLocally(sample, '2026-11-17');
  assert.equal(parsed.storeName, 'Supermercado Atacarejo Central');
  assert.equal(parsed.purchaseDate, '2026-11-15');
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].category, 'Grãos & Secos');
  assert.equal(parsed.items[0].isStockpile, true);
  assert.equal(parsed.items[0].expiryDate, '');
  assert.equal(parsed.items[1].category, 'Hortifruti & Feira');
  assert.equal(parsed.items[1].isStockpile, false);
  assert.equal(parsed.items[1].expiryDate, '');
  assert.equal(parsed.items[2].category, 'Água & Bebidas');
  assert.equal(parsed.items[2].expiryDate, '');

  const demo = createDemoScannedReceipt('2026-11-17');
  assert.ok(demo.items.length > 0);
  for (const item of demo.items) {
    assert.equal(item.expiryDate, '');
  }
});

test('buildMonthlyReport, series, CSV export and read-only #share=... roundtrip work reliably', () => {
  const history: PriceRecord[] = [
    {
      id: 'm1',
      productKey: 'arroz 5kg',
      productName: 'Arroz 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 25,
      referencePrice: 30,
      quantity: 4,
      purchaseDate: '2026-11-05',
      storeName: 'Atacadão',
      isStockpile: true,
    },
    {
      id: 'm2',
      productKey: 'tomate kg',
      productName: 'Tomate kg',
      category: 'Hortifruti & Feira',
      unit: 'kg',
      unitPrice: 7,
      referencePrice: 8,
      quantity: 3,
      purchaseDate: '2026-11-10',
      storeName: 'Feira',
      isStockpile: false,
    },
    {
      id: 'm3',
      productKey: 'arroz 5kg',
      productName: 'Arroz 5kg',
      category: 'Grãos & Secos',
      unit: 'pct',
      unitPrice: 28,
      referencePrice: 30,
      quantity: 3,
      purchaseDate: '2026-10-12',
      storeName: 'Assaí',
      isStockpile: true,
    },
  ];

  const report = buildMonthlyReport(history, [], '2026-11', '2026-10');
  assert.equal(report.totalSpent, 121);
  assert.equal(report.stockpileSpent, 100);
  assert.equal(report.routineSpent, 21);
  assert.equal(report.netSavings, 23);
  assert.equal(report.compareTotalSpent, 84);
  assert.equal(report.compareDiffAmount, 37);

  const series = buildMonthlyTrendSeries(history, '2026-11', 6);
  assert.equal(series.length, 6);
  assert.equal(series[series.length - 1].monthKey, '2026-11');
  assert.equal(series[series.length - 1].stockpileSpent, 100);
  assert.equal(series[series.length - 1].routineSpent, 21);

  const csv = exportMonthlyReportCsv(report);
  assert.ok(csv.includes('Arroz 5kg'));
  assert.ok(csv.includes('Tomate kg'));

  const payload: SharedMonthlyReportPayload = {
    version: 1,
    generatedAt: '2026-11-25',
    report,
    series,
  };
  const hash = encodeSharedReport(payload);
  assert.ok(hash.startsWith('#share='));
  const decoded = decodeSharedReportFromHash(hash);
  assert.ok(decoded);
  assert.equal(decoded?.report.totalSpent, 121);
  assert.equal(decoded?.report.monthKey, '2026-11');
});
