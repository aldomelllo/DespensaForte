import { useEffect, useMemo, useState } from 'react';
import { TopBar, type ActiveTab } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { PriceEvolutionView } from './components/PriceEvolutionView';
import { ReceiptsView } from './components/ReceiptsView';
import { SettingsAlertsView } from './components/SettingsAlertsView';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import type {
  AlertSettings,
  AppState,
  CategoryId,
  InventoryItem,
  ParsedDraftItem,
  PriceRecord,
  ReceiptRecord,
} from './types/inventory';
import {
  analyzeProductPriceTrends,
  calculateCategorySavings,
  calculateDashboardKpis,
  calculateReceiptTotals,
  normalizeProductKey,
} from './utils/analytics';
import { createSeedState } from './data/seedData';
import { loadAppState, saveAppState } from './utils/storage';
import {
  buildExpiryAlertMessage,
  dispatchLocalPushNotification,
  getNotificationPermissionState,
  registerNotificationWorker,
} from './utils/notifications';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<CategoryId | 'Todas'>('Todas');

  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  useEffect(() => {
    if (getNotificationPermissionState() === 'granted' && appState.settings.pushEnabled) {
      void registerNotificationWorker();
      const digest = buildExpiryAlertMessage(
        appState.inventory,
        appState.settings.warningDays,
        appState.settings.criticalDays
      );
      if (digest) {
        void dispatchLocalPushNotification(digest.title, digest.body, 'despensaforte-startup');
      }
    }
  }, []);

  const priceTrends = useMemo(
    () => analyzeProductPriceTrends(appState.priceHistory),
    [appState.priceHistory]
  );

  const categorySavings = useMemo(
    () => calculateCategorySavings(appState.priceHistory, appState.inventory),
    [appState.priceHistory, appState.inventory]
  );

  const kpis = useMemo(
    () =>
      calculateDashboardKpis(
        appState.inventory,
        appState.receipts,
        appState.priceHistory,
        appState.settings.warningDays,
        appState.settings.criticalDays,
        appState.settings.householdSize
      ),
    [appState]
  );

  function handleConfirmReceipt(payload: {
    storeName: string;
    purchaseDate: string;
    source: 'ocr_photo' | 'local_text' | 'demo_seed';
    items: ParsedDraftItem[];
  }) {
    const receiptId = `rec-${Date.now()}`;
    const totals = calculateReceiptTotals(payload.items);

    const newInventoryItems: InventoryItem[] = payload.items.map((item, idx) => ({
      id: `inv-${Date.now()}-${idx}`,
      productKey: normalizeProductKey(item.name),
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      referencePrice: item.referencePrice,
      purchaseDate: payload.purchaseDate,
      expiryDate: item.expiryDate,
      storeName: payload.storeName,
      receiptId,
    }));

    const newPriceRecords: PriceRecord[] = payload.items.map((item, idx) => ({
      id: `ph-${Date.now()}-${idx}`,
      productKey: normalizeProductKey(item.name),
      productName: item.name.trim(),
      category: item.category,
      unit: item.unit,
      unitPrice: item.unitPrice,
      referencePrice: item.referencePrice,
      quantity: item.quantity,
      purchaseDate: payload.purchaseDate,
      storeName: payload.storeName,
      receiptId,
    }));

    const newReceipt: ReceiptRecord = {
      id: receiptId,
      storeName: payload.storeName,
      purchaseDate: payload.purchaseDate,
      totalPaid: totals.totalPaid,
      totalReference: totals.totalReference,
      netSavings: totals.netSavings,
      itemCount: payload.items.length,
      source: payload.source,
      createdAt: new Date().toISOString().slice(0, 10),
      items: payload.items.map((item) => ({
        name: item.name.trim(),
        productKey: normalizeProductKey(item.name),
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        referencePrice: item.referencePrice,
        totalPrice: Number((item.quantity * item.unitPrice).toFixed(2)),
        expiryDate: item.expiryDate,
      })),
    };

    setAppState((prev) => ({
      ...prev,
      inventory: [...newInventoryItems, ...prev.inventory],
      priceHistory: [...prev.priceHistory, ...newPriceRecords],
      receipts: [newReceipt, ...prev.receipts],
    }));

    if (getNotificationPermissionState() === 'granted' && appState.settings.pushEnabled) {
      const digest = buildExpiryAlertMessage(
        [...newInventoryItems, ...appState.inventory],
        appState.settings.warningDays,
        appState.settings.criticalDays
      );
      if (digest) {
        void dispatchLocalPushNotification(digest.title, digest.body, 'despensaforte-update');
      }
    }
  }

  function handleUpdateQuantity(id: string, delta: number) {
    setAppState((prev) => ({
      ...prev,
      inventory: prev.inventory
        .map((item) =>
          item.id === id
            ? { ...item, quantity: Math.max(0, Number((item.quantity + delta).toFixed(2))) }
            : item
        )
        .filter((item) => item.quantity > 0),
    }));
  }

  function handleDeleteItem(id: string) {
    setAppState((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((item) => item.id !== id),
    }));
  }

  function handleAddManualItem(item: {
    name: string;
    category: CategoryId;
    quantity: number;
    unit: string;
    unitPrice: number;
    referencePrice: number;
    expiryDate: string;
    storeName: string;
  }) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const key = normalizeProductKey(item.name);
    const newInv: InventoryItem = {
      id: `inv-${Date.now()}`,
      productKey: key,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      referencePrice: item.referencePrice,
      purchaseDate: todayIso,
      expiryDate: item.expiryDate,
      storeName: item.storeName,
    };

    const newPrice: PriceRecord = {
      id: `ph-${Date.now()}`,
      productKey: key,
      productName: item.name,
      category: item.category,
      unit: item.unit,
      unitPrice: item.unitPrice,
      referencePrice: item.referencePrice,
      quantity: item.quantity,
      purchaseDate: todayIso,
      storeName: item.storeName,
    };

    setAppState((prev) => ({
      ...prev,
      inventory: [newInv, ...prev.inventory],
      priceHistory: [...prev.priceHistory, newPrice],
    }));
  }

  function handleUpdateSettings(settings: AlertSettings) {
    setAppState((prev) => ({ ...prev, settings }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'inventory') setInventoryCategoryFilter('Todas');
          setActiveTab(tab);
        }}
        onOpenScanner={() => setIsScannerOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            kpis={kpis}
            categorySavings={categorySavings}
            priceTrends={priceTrends}
            inventory={appState.inventory}
            warningDays={appState.settings.warningDays}
            criticalDays={appState.settings.criticalDays}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onSelectProductForTrend={(key) => setSelectedProductKey(key)}
            onSelectCategoryFilter={(cat) => setInventoryCategoryFilter(cat)}
            onOpenScanner={() => setIsScannerOpen(true)}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={appState.inventory}
            warningDays={appState.settings.warningDays}
            criticalDays={appState.settings.criticalDays}
            initialCategoryFilter={inventoryCategoryFilter}
            onUpdateQuantity={handleUpdateQuantity}
            onDeleteItem={handleDeleteItem}
            onAddManualItem={handleAddManualItem}
          />
        )}

        {activeTab === 'prices' && (
          <PriceEvolutionView
            trends={priceTrends}
            selectedProductKey={selectedProductKey}
            onSelectProduct={(key) => setSelectedProductKey(key)}
          />
        )}

        {activeTab === 'receipts' && (
          <ReceiptsView
            receipts={appState.receipts}
            onOpenScanner={() => setIsScannerOpen(true)}
          />
        )}

        {activeTab === 'alerts' && (
          <SettingsAlertsView
            appState={appState}
            onUpdateSettings={handleUpdateSettings}
            onImportState={(newState) => setAppState(newState)}
            onResetDemoData={() => setAppState(createSeedState())}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>DespensaForte · Armazenamento local no navegador</span>
          <span>Regra PEPS · Controle doméstico e sobrevivencialismo</span>
        </div>
      </footer>

      <ReceiptScannerModal
        isOpen={isScannerOpen}
        priceTrends={priceTrends}
        onClose={() => setIsScannerOpen(false)}
        onConfirmReceipt={handleConfirmReceipt}
      />
    </div>
  );
}
