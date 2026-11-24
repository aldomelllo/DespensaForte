import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeProductPriceTrends,
  calculateCategorySavings,
  calculateDashboardKpis,
  calculateDaysUntilExpiry,
  calculateReceiptTotals,
  getExpiryStatus,
  normalizeProductKey,
  parseRawReceiptTextLocally,
} from './analytics';
import type { InventoryItem, PriceRecord, ReceiptRecord } from '../types/inventory';

test('normalizeProductKey removes accents, punctuation and normalizes whitespace', () => {
  assert.equal(normalizeProductKey('Feijão Carioca 1kg!'), 'feijao carioca 1kg');
  assert.equal(normalizeProductKey('  Óleo   de Soja 900ml '), 'oleo de soja 900ml');
});

test('expiry days and status classify expired, critical, warning, and ok accurately', () => {
  assert.equal(calculateDaysUntilExpiry('2026-11-10', '2026-11-17'), -7);
  assert.equal(getExpiryStatus('2026-11-10', 30, 7, '2026-11-17'), 'expired');
  assert.equal(getExpiryStatus('2026-11-22', 30, 7, '2026-11-17'), 'critical');
  assert.equal(getExpiryStatus('2026-12-05', 30, 7, '2026-11-17'), 'warning');
  assert.equal(getExpiryStatus('2027-06-01', 30, 7, '2026-11-17'), 'ok');
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

test('calculateReceiptTotals and calculateCategorySavings aggregate net savings accurately', () => {
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
    },
  ];

  const inventory: InventoryItem[] = [
    {
      id: 'i1',
      productKey: 'arroz 5kg',
      name: 'Arroz 5kg',
      category: 'Grãos & Secos',
      quantity: 3,
      unit: 'pct',
      unitPrice: 24.0,
      referencePrice: 29.0,
      purchaseDate: '2026-11-01',
      expiryDate: '2027-11-01',
      storeName: 'Atacadão',
    },
  ];

  const categories = calculateCategorySavings(history, inventory);
  const graos = categories.find((c) => c.category === 'Grãos & Secos');
  const proteinas = categories.find((c) => c.category === 'Proteínas & Enlatados');
  assert.equal(graos?.netSavings, 15.0);
  assert.equal(proteinas?.netSavings, 10.0);

  const kpis = calculateDashboardKpis(inventory, [] as ReceiptRecord[], history, 30, 7, 2, '2026-11-17');
  assert.equal(kpis.totalSavings, 25.0);
  assert.equal(kpis.totalStockValue, 72.0);
  assert.equal(kpis.expiringSoonCount, 0);
});

test('parseRawReceiptTextLocally extracts store, date, and line items reliably', () => {
  const sample = [
    'Supermercado Atacarejo Central',
    '15/11/2026',
    'ARROZ BRANCO 5KG 2 pct x 23,90',
    'SARDINHA EM OLEO 125G 6 lata x 5,40',
    'AGUA MINERAL 5L | 4 | un | 8,50',
  ].join('\n');

  const parsed = parseRawReceiptTextLocally(sample, '2026-11-17');
  assert.equal(parsed.storeName, 'Supermercado Atacarejo Central');
  assert.equal(parsed.purchaseDate, '2026-11-15');
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].category, 'Grãos & Secos');
  assert.equal(parsed.items[0].quantity, 2);
  assert.equal(parsed.items[0].unitPrice, 23.9);
  assert.equal(parsed.items[1].category, 'Proteínas & Enlatados');
  assert.equal(parsed.items[2].category, 'Água & Bebidas');
});
