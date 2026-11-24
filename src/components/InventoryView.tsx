import { useState } from 'react';
import {
  AlertTriangle,
  Minus,
  Plus,
  Search,
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
  formatBRL,
  formatDateBR,
  getExpiryStatus,
} from '../utils/analytics';

interface InventoryViewProps {
  inventory: InventoryItem[];
  warningDays: number;
  criticalDays: number;
  initialCategoryFilter: CategoryId | 'Todas';
  onUpdateQuantity: (id: string, delta: number) => void;
  onDeleteItem: (id: string) => void;
  onAddManualItem: (item: {
    name: string;
    category: CategoryId;
    quantity: number;
    unit: string;
    unitPrice: number;
    referencePrice: number;
    expiryDate: string;
    storeName: string;
  }) => void;
}

export function InventoryView({
  inventory,
  warningDays,
  criticalDays,
  initialCategoryFilter,
  onUpdateQuantity,
  onDeleteItem,
  onAddManualItem,
}: InventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'Todas'>(
    initialCategoryFilter
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'expiring' | 'expired'>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [manualName, setManualName] = useState('');
  const [manualCategory, setManualCategory] = useState<CategoryId>('Grãos & Secos');
  const [manualQty, setManualQty] = useState('2');
  const [manualUnit, setManualUnit] = useState('pct');
  const [manualPrice, setManualPrice] = useState('');
  const [manualRefPrice, setManualRefPrice] = useState('');
  const [manualExpiry, setManualExpiry] = useState(addDaysToIso(todayIso, 365));
  const [manualStore, setManualStore] = useState('Compra Local');
  const [formError, setFormError] = useState<string | null>(null);

  const activeItems = inventory.filter((item) => item.quantity > 0);

  const filteredItems = activeItems
    .filter((item) => {
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
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

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
      expiryDate: manualExpiry || addDaysToIso(todayIso, 365),
      storeName: manualStore.trim() || 'Compra Local',
    });
    setManualName('');
    setManualPrice('');
    setManualRefPrice('');
    setShowAddForm(false);
  }

  function renderStatusLabel(status: ExpiryStatus, days: number) {
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
            Estoque Doméstico e Validade
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Ordenado por data de validade mais próxima (PEPS — Primeiro que Expira, Primeiro que Sai).
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

      {showAddForm && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Novo Item Manual no Estoque
          </h2>
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
                placeholder="Ex: Feijão Preto 1kg"
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
                onChange={(e) => setManualCategory(e.target.value as CategoryId)}
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
              <label htmlFor="manual-expiry" className="block text-xs font-medium text-slate-700 mb-1">
                Data de Validade
              </label>
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
                Mercado
              </label>
              <input
                id="manual-store"
                type="text"
                value={manualStore}
                onChange={(e) => setManualStore(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>

            <div className="sm:col-span-2 flex items-end justify-end gap-3">
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
                Salvar no Estoque
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
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({activeItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expiring')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === 'expiring'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vencendo em breve
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
              Ajuste os filtros ou escaneie um novo cupom fiscal para abastecer o estoque.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Produto / Origem</th>
                  <th className="py-3 px-4">Categoria</th>
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
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-slate-900">{formatBRL(item.unitPrice)}</span>
                        {unitSavings > 0.05 && (
                          <span className="block text-xs text-emerald-700">
                            -{formatBRL(unitSavings)} vs ref.
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {formatDateBR(item.expiryDate)}
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
