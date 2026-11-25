import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CATEGORIES,
  type CategoryId,
  type ExpiryStatus,
  type InventoryItem,
} from '../types/inventory';
import {
  addDaysToIso,
  calculateDaysUntilExpiry,
  calculateStockpileAutonomy,
  defaultIsStockpileForCategory,
  formatBRL,
  formatDateBR,
  getExpiryStatus,
  hasValidExpiryDate,
  inferShelfLifeDays,
} from '../utils/analytics';

export type PantryScope = 'all' | 'stockpile' | 'routine';

interface InventoryViewProps {
  inventory: InventoryItem[];
  warningDays: number;
  criticalDays: number;
  householdSize: number;
  dailyCostPerPerson: number;
  initialCategoryFilter: CategoryId | 'Todas';
  initialPantryScope?: PantryScope;
  onUpdateQuantity: (id: string, delta: number) => void;
  onToggleStockpile: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onAddManualItem: (item: {
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
  }) => void;
}

export function InventoryView({
  inventory,
  warningDays,
  criticalDays,
  householdSize,
  dailyCostPerPerson,
  initialCategoryFilter,
  initialPantryScope = 'all',
  onUpdateQuantity,
  onToggleStockpile,
  onDeleteItem,
  onAddManualItem,
}: InventoryViewProps) {
  const [pantryScope, setPantryScope] = useState<PantryScope>(initialPantryScope);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'Todas'>(
    initialCategoryFilter
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired'>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setCategoryFilter(initialCategoryFilter);
  }, [initialCategoryFilter]);

  useEffect(() => {
    setPantryScope(initialPantryScope);
  }, [initialPantryScope]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState<CategoryId>('Grãos & Secos');
  const [manualQty, setManualQty] = useState('2');
  const [manualUnit, setManualUnit] = useState('pct');
  const [manualPrice, setManualPrice] = useState('');
  const [manualRefPrice, setManualRefPrice] = useState('');
  const [manualPurchaseDate, setManualPurchaseDate] = useState(todayIso);
  // Validade inicia SEMPRE vazia ('') no cadastro manual
  const [manualExpiry, setManualExpiry] = useState('');
  const [manualStore, setManualStore] = useState('Compra Local');
  const [manualIsStockpile, setManualIsStockpile] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const activeItems = inventory.filter((item) => item.quantity > 0);
  const stockpileItems = activeItems.filter((item) => item.isStockpile);
  const routineItems = activeItems.filter((item) => !item.isStockpile);

  const autonomy = calculateStockpileAutonomy(
    activeItems,
    householdSize,
    dailyCostPerPerson
  );
  const routineValue = Number(
    routineItems
      .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)
      .toFixed(2)
  );
  const routineUnits = Number(
    routineItems.reduce((acc, item) => acc + item.quantity, 0).toFixed(1)
  );

  const filteredItems = activeItems
    .filter((item) => {
      if (pantryScope === 'stockpile' && !item.isStockpile) return false;
      if (pantryScope === 'routine' && item.isStockpile) return false;
      if (categoryFilter !== 'Todas' && item.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !item.name.toLowerCase().includes(q) &&
          !item.storeName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      const status = getExpiryStatus(item.expiryDate, warningDays, criticalDays);
      if (statusFilter === 'expiring') {
        return status === 'critical' || status === 'warning';
      }
      if (statusFilter === 'expired') {
        return status === 'expired';
      }
      return true;
    })
    .sort((a, b) => {
      const aHas = hasValidExpiryDate(a.expiryDate);
      const bHas = hasValidExpiryDate(b.expiryDate);
      if (aHas && bHas) return a.expiryDate.localeCompare(b.expiryDate);
      if (aHas) return -1;
      if (bHas) return 1;
      return b.purchaseDate.localeCompare(a.purchaseDate);
    });

  function handleManualCategoryChange(nextCat: CategoryId) {
    setManualCategory(nextCat);
    setManualIsStockpile(defaultIsStockpileForCategory(nextCat));
  }

  function handleSuggestManualExpiry() {
    const base = manualPurchaseDate || todayIso;
    const days = inferShelfLifeDays(manualCategory);
    setManualExpiry(addDaysToIso(base, days));
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(manualQty);
    const price = parseFloat(manualPrice);
    const refPrice = parseFloat(manualRefPrice || manualPrice);
    if (!manualName.trim()) {
      setFormError('Informe o nome do produto.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('Informe uma quantidade maior que zero.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Informe um preço unitário válido.');
      return;
    }
    setFormError(null);
    onAddManualItem({
      name: manualName.trim(),
      category: manualCategory,
      quantity: qty,
      unit: manualUnit.trim() || 'un',
      unitPrice: price,
      referencePrice: Number.isFinite(refPrice) && refPrice > 0 ? refPrice : price,
      purchaseDate: manualPurchaseDate || todayIso,
      expiryDate: manualExpiry.trim(), // Pode ficar vazio ('') sem gerar falso alerta
      storeName: manualStore.trim() || 'Compra Local',
      isStockpile: manualIsStockpile,
    });
    setManualName('');
    setManualPrice('');
    setManualRefPrice('');
    setManualExpiry('');
    setShowAddForm(false);
  }

  function renderStatusLabel(status: ExpiryStatus, days: number) {
    if (status === 'none') {
      return <span className="text-xs text-slate-400">Sem validade</span>;
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 font-mono tabular-nums">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Vencido há {Math.abs(days)}d</span>
        </span>
      );
    }
    if (status === 'critical') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 font-mono tabular-nums">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{days === 0 ? 'Vence hoje' : `Vence em ${days}d`}</span>
        </span>
      );
    }
    if (status === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 font-mono tabular-nums">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Vence em {days}d</span>
        </span>
      );
    }
    return (
      <span className="text-xs text-slate-600 font-mono tabular-nums">
        {days}d restantes
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Despensa Rotineira &amp; Despensa Estocada
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Separe o uso diário/feira da reserva estocada. Alterne qualquer item entre Estocada e Rotineira com 1 clique.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>{showAddForm ? 'Fechar Cadastro Manual' : 'Adicionar Item Manual'}</span>
        </button>
      </div>

      {/* Two Separate Pantry Controls */}
      <section aria-label="Controles separados de despensa" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Despensa Estocada */}
        <button
          type="button"
          onClick={() =>
            setPantryScope((prev) => (prev === 'stockpile' ? 'all' : 'stockpile'))
          }
          className={`text-left rounded-xl p-5 border transition-all ${
            pantryScope === 'stockpile'
              ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-200'
              : 'bg-white border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
              <Archive className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Despensa Estocada (Reserva)</span>
            </span>
            <span className="text-xs font-medium text-emerald-700">
              {pantryScope === 'stockpile' ? 'Filtro ativo (clique p/ ver todos)' : 'Filtrar reserva →'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatBRL(autonomy.stockpileValue)}
              </span>
              <span className="ml-2 text-xs font-mono tabular-nums text-slate-500">
                {stockpileItems.length} lotes · {autonomy.stockpileUnits} un.
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-emerald-200/70 grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-slate-500">Autonomia (volume)</p>
                <p className="font-bold font-mono tabular-nums text-emerald-800">
                  {autonomy.survivalReserveDays} dias
                </p>
              </div>
            </div>
            <div>
              <p className="text-slate-500">
                Autonomia (valor · {householdSize}p × {formatBRL(dailyCostPerPerson)}/d)
              </p>
              <p className="font-bold font-mono tabular-nums text-emerald-800">
                {autonomy.survivalDaysByBudget} dias
              </p>
            </div>
          </div>
        </button>

        {/* Despensa Rotineira */}
        <button
          type="button"
          onClick={() =>
            setPantryScope((prev) => (prev === 'routine' ? 'all' : 'routine'))
          }
          className={`text-left rounded-xl p-5 border transition-all ${
            pantryScope === 'routine'
              ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
              <ShoppingBasket className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Despensa Rotineira (Uso Diário / Feira)</span>
            </span>
            <span className="text-xs font-medium text-amber-800">
              {pantryScope === 'routine' ? 'Filtro ativo (clique p/ ver todos)' : 'Filtrar uso diário →'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatBRL(routineValue)}
              </span>
              <span className="ml-2 text-xs font-mono tabular-nums text-slate-500">
                {routineItems.length} lotes · {routineUnits} un.
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
            Itens de giro rápido (hortifruti, padaria, laticínios e consumo da semana). Não entram na previsão de dias de sobrevivência da reserva.
          </div>
        </button>
      </section>

      {showAddForm && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Novo Item Manual na Despensa
            </h2>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setManualIsStockpile(true)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                  manualIsStockpile
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Estocar (Reserva)</span>
              </button>
              <button
                type="button"
                onClick={() => setManualIsStockpile(false)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                  !manualIsStockpile
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBasket className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Rotineira (Uso Diário)</span>
              </button>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="manual-name" className="block text-xs font-medium text-slate-700 mb-1">
                Produto
              </label>
              <input
                id="manual-name"
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Ex: Feijão Preto 1kg ou Tomate kg"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="manual-cat" className="block text-xs font-medium text-slate-700 mb-1">
                Categoria
              </label>
              <select
                id="manual-cat"
                value={manualCategory}
                onChange={(e) => handleManualCategoryChange(e.target.value as CategoryId)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="manual-qty" className="block text-xs font-medium text-slate-700 mb-1">
                  Qtd
                </label>
                <input
                  id="manual-qty"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={manualQty}
                  onChange={(e) => setManualQty(e.target.value)}
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />
              </div>
              <div>
                <label htmlFor="manual-unit" className="block text-xs font-medium text-slate-700 mb-1">
                  Unidade
                </label>
                <input
                  id="manual-unit"
                  type="text"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="manual-price" className="block text-xs font-medium text-slate-700 mb-1">
                  Preço Pago (R$)
                </label>
                <input
                  id="manual-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder="7.50"
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />
              </div>
              <div>
                <label htmlFor="manual-ref" className="block text-xs font-medium text-slate-700 mb-1">
                  Ref. Mercado
                </label>
                <input
                  id="manual-ref"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={manualRefPrice}
                  onChange={(e) => setManualRefPrice(e.target.value)}
                  placeholder="9.20"
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="manual-purchase-date" className="block text-xs font-medium text-slate-700 mb-1">
                Data da Compra
              </label>
              <input
                id="manual-purchase-date"
                type="date"
                value={manualPurchaseDate}
                onChange={(e) => setManualPurchaseDate(e.target.value)}
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="manual-expiry" className="block text-xs font-medium text-slate-700">
                  Validade (opcional)
                </label>
                <button
                  type="button"
                  onClick={handleSuggestManualExpiry}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  <span>Sugerir</span>
                </button>
              </div>
              <input
                id="manual-expiry"
                type="date"
                value={manualExpiry}
                onChange={(e) => setManualExpiry(e.target.value)}
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>

            <div>
              <label htmlFor="manual-store" className="block text-xs font-medium text-slate-700 mb-1">
                Mercado / Feira
              </label>
              <input
                id="manual-store"
                type="text"
                value={manualStore}
                onChange={(e) => setManualStore(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>

            <div className="flex items-end justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="inventory-search" className="sr-only">
            Buscar produto ou estabelecimento
          </label>
          <input
            id="inventory-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar produto ou estabelecimento..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPantryScope('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                pantryScope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({activeItems.length})
            </button>
            <button
              type="button"
              onClick={() => setPantryScope('stockpile')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                pantryScope === 'stockpile'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Estocada ({stockpileItems.length})
            </button>
            <button
              type="button"
              onClick={() => setPantryScope('routine')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                pantryScope === 'routine'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rotineira ({routineItems.length})
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos prazos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expiring')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'expiring'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vencendo
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'expired'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vencidos
            </button>
          </div>

          <label htmlFor="inventory-cat-select" className="sr-only">
            Filtrar por categoria
          </label>
          <select
            id="inventory-cat-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryId | 'Todas')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <option value="Todas">Todas categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              Nenhum item encontrado com os filtros atuais.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ajuste os filtros ou escaneie um novo cupom fiscal para abastecer sua despensa.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Produto / Origem</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Destino (1 clique)</th>
                  <th className="py-3 px-4 text-right">Qtd Atual</th>
                  <th className="py-3 px-4 text-right">Custo Unit.</th>
                  <th className="py-3 px-4">Validade</th>
                  <th className="py-3 px-4">Prazo</th>
                  <th className="py-3 px-6 text-right">Baixa / Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => {
                  const days = calculateDaysUntilExpiry(item.expiryDate);
                  const status = getExpiryStatus(item.expiryDate, warningDays, criticalDays);
                  const unitSavings = item.referencePrice - item.unitPrice;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.storeName} · Compra {formatDateBR(item.purchaseDate)}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {item.category}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onToggleStockpile(item.id)}
                          title="Clique para mover entre Despensa Estocada e Despensa Rotineira"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            item.isStockpile
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {item.isStockpile ? (
                            <>
                              <Archive className="w-3 h-3" aria-hidden="true" />
                              <span>Estocada</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBasket className="w-3 h-3" aria-hidden="true" />
                              <span>Rotineira</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-900">{formatBRL(item.unitPrice)}</span>
                        {unitSavings > 0.05 ? (
                          <span className="block text-xs text-emerald-700">
                            -{formatBRL(unitSavings)} vs ref.
                          </span>
                        ) : unitSavings < -0.05 ? (
                          <span className="block text-xs text-red-700">
                            +{formatBRL(Math.abs(unitSavings))} vs ref.
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {hasValidExpiryDate(item.expiryDate) ? formatDateBR(item.expiryDate) : '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusLabel(status, days)}
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            aria-label={`Consumir 1 unidade de ${item.name}`}
                            className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            aria-label={`Adicionar 1 unidade de ${item.name}`}
                            className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            aria-label={`Remover ${item.name}`}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
