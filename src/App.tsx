import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TopBar, type ActiveTab } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { InventoryView, type PantryScope } from './components/InventoryView';
import { PriceEvolutionView } from './components/PriceEvolutionView';
import { ReceiptsView } from './components/ReceiptsView';
import { MonthlyReportView } from './components/MonthlyReportView';
import { SettingsAlertsView } from './components/SettingsAlertsView';
import { AdminUsersView } from './components/AdminUsersView';
import { AuthGateView } from './components/AuthGateView';
import { ReceiptScannerModal } from './components/ReceiptScannerModal';
import type { AuthUser } from './types/auth';
import type {
  AlertSettings,
  AppState,
  CategoryId,
  InventoryItem,
  ParsedDraftItem,
  PriceRecord,
  ReceiptRecord,
  SharedMonthlyReportPayload,
} from './types/inventory';
import {
  analyzeProductPriceTrends,
  calculateCategorySavings,
  calculateDashboardKpis,
  calculateReceiptTotals,
  normalizeProductKey,
} from './utils/analytics';
import { createSeedState } from './data/seedData';
import {
  createEmptyState,
  loadCachedUserState,
  normalizeAppState,
  saveCachedUserState,
} from './utils/storage';
import { decodeSharedReportFromHash } from './utils/shareReport';
import {
  fetchAuthStatus,
  fetchUserCloudState,
  logoutSession,
  saveUserCloudState,
} from './services/api';
import {
  buildExpiryAlertMessage,
  dispatchLocalPushNotification,
  getNotificationPermissionState,
  registerNotificationWorker,
} from './utils/notifications';

export default function App() {
  const [sharedReport, setSharedReport] = useState<SharedMonthlyReportPayload | null>(() =>
    typeof window !== 'undefined' ? decodeSharedReportFromHash(window.location.hash) : null
  );

  // Estado de autenticação e conta ativa
  const [authLoading, setAuthLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [storageError, setStorageError] = useState<string | undefined>(undefined);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Estado da despensa isolado por usuário
  const [appState, setAppState] = useState<AppState>(() => createEmptyState());
  const [stateLoadedForUserId, setStateLoadedForUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<CategoryId | 'Todas'>('Todas');
  const [inventoryPantryScope, setInventoryPantryScope] = useState<PantryScope>('all');

  const checkSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await fetchAuthStatus();
      setStorageConfigured(status.storageConfigured);
      setStorageError(status.error);
      setNeedsBootstrap(status.needsBootstrap);
      setCurrentUser(status.user);
    } catch (err) {
      setStorageConfigured(true);
      setCurrentUser(null);
      setStorageError(err instanceof Error ? err.message : undefined);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    function handleHashChange() {
      const decoded = decodeSharedReportFromHash(window.location.hash);
      setSharedReport(decoded);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Carrega dados isolados da nuvem sempre que o usuário logado mudar
  useEffect(() => {
    if (!currentUser) {
      setStateLoadedForUserId(null);
      setAppState(createEmptyState());
      setSyncStatus('idle');
      return;
    }

    let cancelled = false;
    const userId = currentUser.id;
    const isAdmin = currentUser.role === 'admin';

    async function hydrateUserPantry() {
      setStateLoadedForUserId(null);
      try {
        const cloudState = await fetchUserCloudState();
        if (cancelled) return;

        if (cloudState) {
          const normalized = normalizeAppState(cloudState);
          setAppState(normalized);
          saveCachedUserState(userId, normalized);
          setSyncStatus('saved');
        } else {
          const cached = loadCachedUserState(userId);
          const initial = cached ?? (isAdmin ? createSeedState() : createEmptyState());
          setAppState(initial);
          saveCachedUserState(userId, initial);
          // Persiste estado inicial isolado do usuário na nuvem
          await saveUserCloudState(initial).catch(() => {});
          setSyncStatus('saved');
        }
        setStateLoadedForUserId(userId);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
          setCurrentUser(null);
          return;
        }
        const fallback = loadCachedUserState(userId) ?? createEmptyState();
        setAppState(fallback);
        setStateLoadedForUserId(userId);
        setSyncStatus('error');
      }
    }

    void hydrateUserPantry();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // Salva automaticamente na nuvem (isolado pelo cookie do usuário logado) com debounce
  useEffect(() => {
    if (!currentUser || stateLoadedForUserId !== currentUser.id) return;

    saveCachedUserState(currentUser.id, appState);
    setSyncStatus('saving');

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveUserCloudState(appState)
        .then(() => {
          setSyncStatus('saved');
        })
        .catch((err) => {
          if (err instanceof Error && err.message === 'UNAUTHORIZED') {
            setCurrentUser(null);
            return;
          }
          setSyncStatus('error');
        });
    }, 650);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [appState, currentUser?.id, stateLoadedForUserId]);

  useEffect(() => {
    if (!currentUser || stateLoadedForUserId !== currentUser.id) return;
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
  }, [currentUser?.id, stateLoadedForUserId]);

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
        appState.settings.householdSize,
        undefined,
        appState.settings.dailyCostPerPerson
      ),
    [appState]
  );

  async function handleLogout() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    await logoutSession();
    setCurrentUser(null);
    setStateLoadedForUserId(null);
    setAppState(createEmptyState());
    setActiveTab('dashboard');
    setIsScannerOpen(false);
  }

  function handleConfirmReceipt(payload: {
    storeName: string;
    purchaseDate: string;
    source: 'ocr_photo' | 'local_text' | 'demo_seed';
    items: ParsedDraftItem[];
  }) {
    const receiptId = `rec-${Date.now()}`;
    const insertedIso = new Date().toISOString().slice(0, 10);
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
      insertedAt: insertedIso,
      expiryDate: item.expiryDate,
      storeName: payload.storeName,
      receiptId,
      isStockpile: item.isStockpile,
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
      insertedAt: insertedIso,
      storeName: payload.storeName,
      receiptId,
      isStockpile: item.isStockpile,
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
      createdAt: insertedIso,
      insertedAt: insertedIso,
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
        isStockpile: item.isStockpile,
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

  function handleToggleStockpile(id: string) {
    setAppState((prev) => ({
      ...prev,
      inventory: prev.inventory.map((item) =>
        item.id === id ? { ...item, isStockpile: !item.isStockpile } : item
      ),
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
    purchaseDate: string;
    expiryDate: string;
    storeName: string;
    isStockpile: boolean;
  }) {
    const insertedIso = new Date().toISOString().slice(0, 10);
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
      purchaseDate: item.purchaseDate || insertedIso,
      insertedAt: insertedIso,
      expiryDate: item.expiryDate,
      storeName: item.storeName,
      isStockpile: item.isStockpile,
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
      purchaseDate: item.purchaseDate || insertedIso,
      insertedAt: insertedIso,
      storeName: item.storeName,
      isStockpile: item.isStockpile,
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

  function handleExitSharedMode() {
    setSharedReport(null);
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#share=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setActiveTab('dashboard');
  }

  // Link de relatório somente leitura (#share=...) pode ser aberto por quem recebeu o link sem precisar de login
  if (sharedReport) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 no-print">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              DespensaForte
            </span>
            <button
              type="button"
              onClick={handleExitSharedMode}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Entrar na minha conta
            </button>
          </div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <MonthlyReportView
            priceHistory={[]}
            receipts={[]}
            sharedPayload={sharedReport}
            onExitSharedMode={handleExitSharedMode}
          />
        </main>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-700" aria-hidden="true" />
        <p className="text-sm font-medium">Carregando DespensaForte...</p>
      </div>
    );
  }

  if (!storageConfigured || !currentUser) {
    return (
      <AuthGateView
        storageConfigured={storageConfigured}
        needsBootstrap={needsBootstrap}
        storageError={storageError}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          setNeedsBootstrap(false);
          setActiveTab('dashboard');
        }}
        onRetryStatus={() => void checkSession()}
      />
    );
  }

  const isLoadingUserPantry = stateLoadedForUserId !== currentUser.id;
  const effectiveTab: ActiveTab =
    activeTab === 'admin' && currentUser.role !== 'admin' ? 'dashboard' : activeTab;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={effectiveTab}
        currentUser={currentUser}
        syncStatus={syncStatus}
        onSelectTab={(tab) => {
          if (tab === 'admin' && currentUser.role !== 'admin') return;
          if (tab === 'inventory') {
            setInventoryCategoryFilter('Todas');
            setInventoryPantryScope('all');
          }
          setActiveTab(tab);
        }}
        onOpenScanner={() => setIsScannerOpen(true)}
        onLogout={() => void handleLogout()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoadingUserPantry ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-700" aria-hidden="true" />
            <p className="text-sm">Carregando sua despensa privada...</p>
          </div>
        ) : (
          <>
            {effectiveTab === 'dashboard' && (
              <DashboardView
                kpis={kpis}
                categorySavings={categorySavings}
                priceTrends={priceTrends}
                inventory={appState.inventory}
                warningDays={appState.settings.warningDays}
                criticalDays={appState.settings.criticalDays}
                householdSize={appState.settings.householdSize}
                dailyCostPerPerson={appState.settings.dailyCostPerPerson}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onSelectProductForTrend={(key) => setSelectedProductKey(key)}
                onSelectCategoryFilter={(cat) => setInventoryCategoryFilter(cat)}
                onSelectPantryMode={(mode) => setInventoryPantryScope(mode)}
                onOpenScanner={() => setIsScannerOpen(true)}
              />
            )}

            {effectiveTab === 'inventory' && (
              <InventoryView
                inventory={appState.inventory}
                warningDays={appState.settings.warningDays}
                criticalDays={appState.settings.criticalDays}
                householdSize={appState.settings.householdSize}
                dailyCostPerPerson={appState.settings.dailyCostPerPerson}
                initialCategoryFilter={inventoryCategoryFilter}
                initialPantryScope={inventoryPantryScope}
                onUpdateQuantity={handleUpdateQuantity}
                onToggleStockpile={handleToggleStockpile}
                onDeleteItem={handleDeleteItem}
                onAddManualItem={handleAddManualItem}
              />
            )}

            {effectiveTab === 'prices' && (
              <PriceEvolutionView
                trends={priceTrends}
                selectedProductKey={selectedProductKey}
                onSelectProduct={(key) => setSelectedProductKey(key)}
              />
            )}

            {effectiveTab === 'receipts' && (
              <ReceiptsView
                receipts={appState.receipts}
                onOpenScanner={() => setIsScannerOpen(true)}
              />
            )}

            {effectiveTab === 'report' && (
              <MonthlyReportView
                priceHistory={appState.priceHistory}
                receipts={appState.receipts}
              />
            )}

            {effectiveTab === 'alerts' && (
              <SettingsAlertsView
                appState={appState}
                currentUser={currentUser}
                onUserUpdated={(updated) => setCurrentUser(updated)}
                onLogout={() => void handleLogout()}
                onUpdateSettings={handleUpdateSettings}
                onImportState={(newState) => setAppState(newState)}
                onResetDemoData={() => setAppState(createSeedState())}
                onStartCleanPantry={() => setAppState(createEmptyState())}
              />
            )}

            {effectiveTab === 'admin' && currentUser.role === 'admin' && (
              <AdminUsersView currentUser={currentUser} />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            DespensaForte · Conta conectada:{' '}
            <strong className="text-slate-700">{currentUser.displayName}</strong> (dados privados e isolados)
          </span>
          <span>Controle de Gastos de Feira, Despensa Rotineira &amp; Estocagem</span>
        </div>
      </footer>

      <ReceiptScannerModal
        isOpen={isScannerOpen}
        priceTrends={priceTrends}
        currentUser={currentUser}
        onOcrUsageUpdated={(used) =>
          setCurrentUser((prev) => (prev ? { ...prev, ocrUsedThisMonth: used } : prev))
        }
        onClose={() => setIsScannerOpen(false)}
        onConfirmReceipt={handleConfirmReceipt}
      />
    </div>
  );
}
