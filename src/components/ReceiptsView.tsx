import { useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Search,
  ShoppingBasket,
  X,
} from 'lucide-react';
import type { ReceiptRecord } from '../types/inventory';
import {
  defaultIsStockpileForCategory,
  formatBRL,
  formatDateBR,
  formatMonthLabelBR,
  hasValidExpiryDate,
  shiftMonthKey,
} from '../utils/analytics';

interface ReceiptsViewProps {
  receipts: ReceiptRecord[];
  onOpenScanner: () => void;
}

type DateAxisMode = 'purchaseDate' | 'insertedAt';
type DestFilter = 'all' | 'stockpile' | 'routine';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function ReceiptsView({ receipts, onOpenScanner }: ReceiptsViewProps) {
  const [dateMode, setDateMode] = useState<DateAxisMode>('purchaseDate');
  const [calendarMonth, setCalendarMonth] = useState<string>(() => {
    const latest = [...receipts].sort((a, b) =>
      b.purchaseDate.localeCompare(a.purchaseDate)
    )[0];
    return (latest?.purchaseDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
  });
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(receipts[0]?.id ?? null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [destFilter, setDestFilter] = useState<DestFilter>('all');

  function getReceiptDateByMode(receipt: ReceiptRecord, mode: DateAxisMode): string {
    if (mode === 'insertedAt') {
      return receipt.insertedAt || receipt.createdAt || receipt.purchaseDate;
    }
    return receipt.purchaseDate;
  }

  // Filtragem principal (sem o filtro de dia único do calendário, para manter marcações no calendário coerentes com a busca/destino)
  const baseFilteredReceipts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const targetDate = getReceiptDateByMode(receipt, dateMode);
      if (startDate && targetDate < startDate) return false;
      if (endDate && targetDate > endDate) return false;

      if (q) {
        const matchesStore = receipt.storeName.toLowerCase().includes(q);
        const matchesItem = receipt.items.some((item) =>
          item.name.toLowerCase().includes(q)
        );
        if (!matchesStore && !matchesItem) return false;
      }

      if (destFilter !== 'all') {
        const hasMatch = receipt.items.some((item) => {
          const isStock = item.isStockpile ?? defaultIsStockpileForCategory(item.category);
          return destFilter === 'stockpile' ? isStock : !isStock;
        });
        if (!hasMatch) return false;
      }

      return true;
    });
  }, [receipts, dateMode, startDate, endDate, searchQuery, destFilter]);

  // Mapa por dia (YYYY-MM-DD) para o calendário
  const receiptsByDay = useMemo(() => {
    const map = new Map<string, { receipts: ReceiptRecord[]; totalPaid: number }>();
    for (const r of baseFilteredReceipts) {
      const dayKey = getReceiptDateByMode(r, dateMode).slice(0, 10);
      const entry = map.get(dayKey) ?? { receipts: [], totalPaid: 0 };
      entry.receipts.push(r);
      entry.totalPaid = Number((entry.totalPaid + r.totalPaid).toFixed(2));
      map.set(dayKey, entry);
    }
    return map;
  }, [baseFilteredReceipts, dateMode]);

  // Construção da grade do calendário do mês selecionado
  const calendarDays = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    if (!year || !month) return [];
    const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const cells: Array<{ iso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ iso: null, dayNum: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, dayNum: d });
    }
    return cells;
  }, [calendarMonth]);

  const monthSummary = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const [dayIso, info] of receiptsByDay.entries()) {
      if (dayIso.startsWith(calendarMonth)) {
        count += info.receipts.length;
        total += info.totalPaid;
      }
    }
    return { count, total: Number(total.toFixed(2)) };
  }, [receiptsByDay, calendarMonth]);

  const displayedReceipts = useMemo(() => {
    const list = selectedDayIso
      ? baseFilteredReceipts.filter(
          (r) => getReceiptDateByMode(r, dateMode).slice(0, 10) === selectedDayIso
        )
      : baseFilteredReceipts;

    return [...list].sort((a, b) =>
      getReceiptDateByMode(b, dateMode).localeCompare(getReceiptDateByMode(a, dateMode))
    );
  }, [baseFilteredReceipts, selectedDayIso, dateMode]);

  function handleDayClick(iso: string) {
    const dayEntry = receiptsByDay.get(iso);
    if (!dayEntry || dayEntry.receipts.length === 0) return;
    if (selectedDayIso === iso) {
      setSelectedDayIso(null);
      return;
    }
    setSelectedDayIso(iso);
    setExpandedId(dayEntry.receipts[0].id);
  }

  const hasActiveFilters = Boolean(
    searchQuery.trim() || startDate || endDate || destFilter !== 'all' || selectedDayIso
  );

  function clearFilters() {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setDestFilter('all');
    setSelectedDayIso(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cupons Fiscais &amp; Calendário de Compras
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulte seus cupons por Data da Compra ou Data de Inserção. Clique em qualquer dia marcado para abrir os itens diretamente.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenScanner}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Escanear Novo Cupom</span>
        </button>
      </div>

      {/* Interactive Monthly Calendar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-700" aria-hidden="true" />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setCalendarMonth((m) => shiftMonthKey(m, -1));
                  setSelectedDayIso(null);
                }}
                aria-label="Mês anterior"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <h2 className="px-3 text-base font-bold text-slate-900 min-w-[155px] text-center">
                {formatMonthLabelBR(calendarMonth)}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCalendarMonth((m) => shiftMonthKey(m, 1));
                  setSelectedDayIso(null);
                }}
                aria-label="Próximo mês"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-mono tabular-nums text-slate-600">
              No mês: <strong className="text-slate-900">{monthSummary.count}</strong>{' '}
              {monthSummary.count === 1 ? 'cupom' : 'cupons'} ·{' '}
              <strong className="text-emerald-800">{formatBRL(monthSummary.total)}</strong>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => {
                  setDateMode('purchaseDate');
                  setSelectedDayIso(null);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  dateMode === 'purchaseDate'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Data da Compra
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateMode('insertedAt');
                  setSelectedDayIso(null);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  dateMode === 'insertedAt'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Data de Inserção
              </button>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((cell, idx) => {
            if (!cell.iso || !cell.dayNum) {
              return <div key={`empty-${idx}`} className="h-16 sm:h-18 rounded-lg bg-slate-50/50" />;
            }

            const dayEntry = receiptsByDay.get(cell.iso);
            const hasReceipts = Boolean(dayEntry && dayEntry.receipts.length > 0);
            const isSelected = selectedDayIso === cell.iso;

            return (
              <button
                key={cell.iso}
                type="button"
                disabled={!hasReceipts}
                onClick={() => handleDayClick(cell.iso!)}
                aria-label={
                  hasReceipts
                    ? `Dia ${cell.dayNum}: ${dayEntry!.receipts.length} cupom(ns), total ${formatBRL(dayEntry!.totalPaid)}`
                    : `Dia ${cell.dayNum}: sem cupons`
                }
                className={`h-16 sm:h-18 p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-300'
                    : hasReceipts
                      ? 'bg-emerald-50/80 border-emerald-300 text-slate-900 hover:bg-emerald-100 cursor-pointer'
                      : 'bg-white border-slate-100 text-slate-400 cursor-default'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono font-semibold ${
                      isSelected
                        ? 'text-white'
                        : hasReceipts
                          ? 'text-emerald-900'
                          : 'text-slate-400'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {hasReceipts && (
                    <span
                      className={`text-[10px] font-mono px-1 rounded ${
                        isSelected
                          ? 'bg-emerald-800 text-emerald-100'
                          : 'bg-emerald-200/80 text-emerald-900'
                      }`}
                    >
                      {dayEntry!.receipts.length}
                    </span>
                  )}
                </div>

                {hasReceipts && (
                  <div
                    className={`text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums truncate ${
                      isSelected ? 'text-emerald-50' : 'text-emerald-800'
                    }`}
                  >
                    {formatBRL(dayEntry!.totalPaid)}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {selectedDayIso && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-emerald-800 font-medium">
              Exibindo cupons de{' '}
              <strong>{formatDateBR(selectedDayIso)}</strong> (
              {dateMode === 'purchaseDate' ? 'Data da Compra' : 'Data de Inserção'})
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayIso(null)}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Mostrar todos do período</span>
            </button>
          </div>
        )}
      </section>

      {/* Filters Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label htmlFor="receipts-search" className="block text-xs font-medium text-slate-600 mb-1">
              Buscar produto ou mercado
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="receipts-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: Tomate, Arroz, Atacadão..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="receipts-start-date" className="block text-xs font-medium text-slate-600 mb-1">
              De ({dateMode === 'purchaseDate' ? 'Compra' : 'Inserção'})
            </label>
            <input
              id="receipts-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="receipts-end-date" className="block text-xs font-medium text-slate-600 mb-1">
              Até ({dateMode === 'purchaseDate' ? 'Compra' : 'Inserção'})
            </label>
            <input
              id="receipts-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900"
            />
          </div>

          <div className="lg:col-span-3">
            <label htmlFor="receipts-dest-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Destino dos itens
            </label>
            <select
              id="receipts-dest-filter"
              value={destFilter}
              onChange={(e) => setDestFilter(e.target.value as DestFilter)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
            >
              <option value="all">Todos os destinos</option>
              <option value="stockpile">Com itens Estocados (Reserva)</option>
              <option value="routine">Com itens Rotineiros (Feira/Uso Diário)</option>
            </select>
          </div>

          <div className="lg:col-span-1 flex justify-end">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Receipts List */}
      {displayedReceipts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Nenhum cupom encontrado
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {hasActiveFilters
              ? 'Ajuste os filtros ou limpe o dia selecionado no calendário.'
              : 'Envie a foto de um cupom fiscal ou cole o texto da NFC-e para catalogar seus itens.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 px-4 py-2 text-sm font-medium text-slate-800 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
            >
              Limpar Filtros
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenScanner}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Escanear Primeiro Cupom
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayedReceipts.map((receipt) => {
            const isExpanded = expandedId === receipt.id || Boolean(selectedDayIso);
            const isPositive = receipt.netSavings >= 0;
            const insertedIso = receipt.insertedAt || receipt.createdAt || receipt.purchaseDate;

            const visibleItems =
              destFilter === 'all'
                ? receipt.items
                : receipt.items.filter((item) => {
                    const isStock =
                      item.isStockpile ?? defaultIsStockpileForCategory(item.category);
                    return destFilter === 'stockpile' ? isStock : !isStock;
                  });

            return (
              <section
                key={receipt.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === receipt.id ? null : receipt.id)}
                  aria-expanded={isExpanded}
                  className="w-full px-6 py-4 text-left flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                >
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {receipt.storeName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Compra: <strong className="font-mono text-slate-700">{formatDateBR(receipt.purchaseDate)}</strong> ·{' '}
                      Inserido em: <strong className="font-mono text-slate-700">{formatDateBR(insertedIso)}</strong> ·{' '}
                      {receipt.itemCount} {receipt.itemCount === 1 ? 'item' : 'itens'} ·{' '}
                      {receipt.source === 'ocr_photo'
                        ? 'Foto (OCR)'
                        : receipt.source === 'local_text'
                          ? 'Texto local'
                          : 'Registro inicial'}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-semibold text-slate-900">
                        Pago {formatBRL(receipt.totalPaid)}
                      </p>
                      <p
                        className={`text-xs font-medium ${
                          isPositive ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isPositive ? 'Comprou bem +' : 'Acima '}
                        {formatBRL(Math.abs(receipt.netSavings))}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-6">Item</th>
                          <th className="py-2.5 px-4">Categoria</th>
                          <th className="py-2.5 px-4">Destino</th>
                          <th className="py-2.5 px-4 text-right">Qtd</th>
                          <th className="py-2.5 px-4 text-right">Unit. Pago</th>
                          <th className="py-2.5 px-4 text-right">Ref.</th>
                          <th className="py-2.5 px-6 text-right">Validade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {visibleItems.map((item, idx) => {
                          const isStock =
                            item.isStockpile ?? defaultIsStockpileForCategory(item.category);
                          return (
                            <tr key={`${receipt.id}-${idx}`}>
                              <td className="py-2.5 px-6 font-medium text-slate-900">
                                {item.name}
                              </td>
                              <td className="py-2.5 px-4 text-xs text-slate-600">
                                {item.category}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                    isStock
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {isStock ? (
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
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {formatBRL(item.unitPrice)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                                {formatBRL(item.referencePrice)}
                              </td>
                              <td className="py-2.5 px-6 text-right font-mono tabular-nums text-xs text-slate-600">
                                {hasValidExpiryDate(item.expiryDate)
                                  ? formatDateBR(item.expiryDate)
                                  : 'Sem validade'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
