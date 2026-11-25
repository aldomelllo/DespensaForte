import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  Layers,
  Printer,
  Share2,
  ShoppingBasket,
} from 'lucide-react';
import type {
  CategoryId,
  MonthlyReportItem,
  MonthlyReportSummary,
  MonthlySeriesPoint,
  PriceRecord,
  ReceiptRecord,
  SharedMonthlyReportPayload,
} from '../types/inventory';
import {
  buildMonthlyReport,
  buildMonthlyTrendSeries,
  exportMonthlyReportCsv,
  formatBRL,
  formatDateBR,
  formatMonthLabelBR,
  getAvailableMonths,
  getPreviousMonthKey,
} from '../utils/analytics';
import { buildSharedReportUrl } from '../utils/shareReport';

interface MonthlyReportViewProps {
  priceHistory: PriceRecord[];
  receipts: ReceiptRecord[];
  sharedPayload?: SharedMonthlyReportPayload | null;
  onExitSharedMode?: () => void;
}

type ItemScopeFilter = 'all' | 'stockpile' | 'routine';

export function MonthlyReportView({
  priceHistory,
  receipts,
  sharedPayload = null,
  onExitSharedMode,
}: MonthlyReportViewProps) {
  const isReadOnly = Boolean(sharedPayload);

  const availableMonths = useMemo(
    () => getAvailableMonths(priceHistory, receipts),
    [priceHistory, receipts]
  );

  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => sharedPayload?.report.monthKey ?? availableMonths[0] ?? new Date().toISOString().slice(0, 7)
  );
  const [compareMonth, setCompareMonth] = useState<string>(
    () =>
      sharedPayload?.report.compareMonthKey ??
      getPreviousMonthKey(availableMonths[0] ?? new Date().toISOString().slice(0, 7))
  );

  const [itemFilter, setItemFilter] = useState<ItemScopeFilter>('all');
  const [groupByCategory, setGroupByCategory] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const effectiveSelectedMonth = isReadOnly
    ? sharedPayload!.report.monthKey
    : availableMonths.includes(selectedMonth)
      ? selectedMonth
      : availableMonths[0];

  const effectiveCompareMonth = isReadOnly
    ? sharedPayload!.report.compareMonthKey
    : compareMonth;

  const compareOptions = useMemo(() => {
    const set = new Set<string>(availableMonths);
    set.add(getPreviousMonthKey(effectiveSelectedMonth));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableMonths, effectiveSelectedMonth]);

  const report: MonthlyReportSummary = useMemo(() => {
    if (sharedPayload) return sharedPayload.report;
    return buildMonthlyReport(
      priceHistory,
      receipts,
      effectiveSelectedMonth,
      effectiveCompareMonth
    );
  }, [sharedPayload, priceHistory, receipts, effectiveSelectedMonth, effectiveCompareMonth]);

  const series: MonthlySeriesPoint[] = useMemo(() => {
    if (sharedPayload) return sharedPayload.series;
    return buildMonthlyTrendSeries(priceHistory, effectiveSelectedMonth, 6);
  }, [sharedPayload, priceHistory, effectiveSelectedMonth]);

  const filteredItems = useMemo(() => {
    return report.items.filter((item) => {
      if (itemFilter === 'stockpile') return item.isStockpile;
      if (itemFilter === 'routine') return !item.isStockpile;
      return true;
    });
  }, [report.items, itemFilter]);

  const groupedItems = useMemo(() => {
    const map = new Map<CategoryId, { items: MonthlyReportItem[]; subtotal: number; savings: number }>();
    for (const item of filteredItems) {
      const entry = map.get(item.category) ?? { items: [], subtotal: 0, savings: 0 };
      entry.items.push(item);
      entry.subtotal = Number((entry.subtotal + item.totalPaid).toFixed(2));
      entry.savings = Number((entry.savings + item.netSavings).toFixed(2));
      map.set(item.category, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].subtotal - a[1].subtotal);
  }, [filteredItems]);

  function handleSelectMonth(nextMonth: string) {
    setSelectedMonth(nextMonth);
    setCompareMonth(getPreviousMonthKey(nextMonth));
  }

  function handleExportCsv() {
    const csv = exportMonthlyReportCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despensaforte-relatorio-${report.monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    window.print();
  }

  async function handleShareReportLink() {
    const payload: SharedMonthlyReportPayload = {
      version: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      report,
      series,
    };
    const url = buildSharedReportUrl(payload);

    try {
      if (navigator.clipboard && 'writeText' in navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareFeedback('Link somente leitura copiado! Qualquer pessoa pode visualizar este resumo sem alterar os dados dela.');
      } else {
        window.prompt('Copie o link somente leitura deste relatório:', url);
      }
    } catch {
      window.prompt('Copie o link somente leitura deste relatório:', url);
    }
    setTimeout(() => setShareFeedback(null), 5000);
  }

  // Dimensões do gráfico empilhado SVG
  const maxSeriesTotal = Math.max(10, ...series.map((p) => p.totalSpent));
  const chartWidth = 680;
  const chartHeight = 230;
  const padLeft = 58;
  const padRight = 20;
  const padTop = 26;
  const padBottom = 34;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;
  const slotW = plotW / Math.max(1, series.length);
  const barW = Math.min(54, slotW * 0.56);

  return (
    <div className="space-y-6">
      {isReadOnly && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              Relatório Mensal Compartilhado (Somente Leitura)
            </p>
            <p className="text-xs text-emerald-800 mt-0.5">
              Este resumo foi compartilhado via link e não altera os dados salvos no seu navegador.
            </p>
          </div>
          {onExitSharedMode && (
            <button
              type="button"
              onClick={onExitSharedMode}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Abrir minha própria DespensaForte</span>
            </button>
          )}
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Relatório Mensal — {formatMonthLabelBR(report.monthKey)}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Resumo fechado comparando Despensa Estocada vs. Uso Diário (Feira) contra{' '}
            <strong className="text-slate-900">{formatMonthLabelBR(report.compareMonthKey)}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {!isReadOnly && (
            <>
              <div className="flex items-center gap-1.5">
                <label htmlFor="report-month-select" className="text-xs font-medium text-slate-600">
                  Mês:
                </label>
                <select
                  id="report-month-select"
                  value={effectiveSelectedMonth}
                  onChange={(e) => handleSelectMonth(e.target.value)}
                  className="text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900"
                >
                  {availableMonths.map((mk) => (
                    <option key={mk} value={mk}>
                      {formatMonthLabelBR(mk)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="report-compare-select" className="text-xs font-medium text-slate-600">
                  Comparar:
                </label>
                <select
                  id="report-compare-select"
                  value={effectiveCompareMonth}
                  onChange={(e) => setCompareMonth(e.target.value)}
                  className="text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900"
                >
                  {compareOptions.map((mk) => (
                    <option key={mk} value={mk}>
                      {formatMonthLabelBR(mk)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Imprimir / PDF</span>
          </button>

          {!isReadOnly && (
            <button
              type="button"
              onClick={handleShareReportLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              {shareFeedback ? (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>Link Somente Leitura</span>
            </button>
          )}
        </div>
      </div>

      {shareFeedback && (
        <div role="status" className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900 no-print">
          {shareFeedback}
        </div>
      )}

      {/* 4 Closed-Month KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-break-avoid">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Gasto Total no Mês</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatBRL(report.totalSpent)}
            </span>
            {report.compareDiffPercent !== null && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-mono font-semibold ${
                  report.compareDiffAmount <= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {report.compareDiffAmount <= 0 ? (
                  <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {report.compareDiffPercent > 0
                  ? `+${report.compareDiffPercent}%`
                  : `${report.compareDiffPercent}%`}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            vs. {formatBRL(report.compareTotalSpent)} em {formatMonthLabelBR(report.compareMonthKey)}
          </p>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-5">
          <p className="text-xs font-medium text-emerald-800">Despensa Estocada (Reserva)</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-900">
              {formatBRL(report.stockpileSpent)}
            </span>
            <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
              {report.stockpileSharePct}%
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Investimento em estoque de reserva no mês
          </p>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-5">
          <p className="text-xs font-medium text-amber-800">Uso Diário / Feira (Rotineira)</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatBRL(report.routineSpent)}
            </span>
            <span className="text-xs font-mono tabular-nums text-amber-800 font-semibold">
              {report.routineSharePct}%
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Consumo imediato, hortifruti e padaria
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {report.netSavings >= 0 ? 'Economia vs. Referência' : 'Acréscimo vs. Referência'}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                report.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {report.netSavings >= 0 ? '+' : ''}
              {formatBRL(report.netSavings)}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {report.savingsPercent >= 0 ? `+${report.savingsPercent}%` : `${report.savingsPercent}%`}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {report.itemCount} lançamentos em {report.receiptCount} {report.receiptCount === 1 ? 'cupom' : 'cupons'}
          </p>
        </div>
      </section>

      {/* Stacked Bar Chart of Recent Months */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 print-break-avoid">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Evolução Mensal Empilhada (Últimos 6 Meses)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare mês a mês quanto foi direcionado para Estocada vs. Uso Diário (Rotineira).
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
              <span>Estocada</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block" />
              <span>Uso Diário (Rotineira)</span>
            </span>
          </div>
        </div>

        <div className="mt-4 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto min-w-[480px]"
            role="img"
            aria-label="Gráfico comparativo empilhado de gastos mensais entre Estocada e Uso Diário"
          >
            {[0, 0.5, 1].map((t) => {
              const y = padTop + plotH - t * plotH;
              const val = Math.round(maxSeriesTotal * t);
              return (
                <g key={t}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={chartWidth - padRight}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 text-[11px] font-mono"
                  >
                    R${val}
                  </text>
                </g>
              );
            })}

            {series.map((point, idx) => {
              const cx = padLeft + idx * slotW + slotW / 2;
              const x = cx - barW / 2;
              const stockH = (point.stockpileSpent / maxSeriesTotal) * plotH;
              const routineH = (point.routineSpent / maxSeriesTotal) * plotH;
              const totalH = stockH + routineH;
              const yStock = padTop + plotH - stockH;
              const yRoutine = yStock - routineH;
              const isCurrent = point.monthKey === report.monthKey;

              return (
                <g key={point.monthKey}>
                  {isCurrent && (
                    <rect
                      x={x - 5}
                      y={padTop - 4}
                      width={barW + 10}
                      height={plotH + 8}
                      rx="6"
                      fill="#ECFDF5"
                    />
                  )}
                  {stockH > 0 && (
                    <rect
                      x={x}
                      y={yStock}
                      width={barW}
                      height={stockH}
                      rx={routineH === 0 ? 3 : 0}
                      fill="#059669"
                    />
                  )}
                  {routineH > 0 && (
                    <rect
                      x={x}
                      y={yRoutine}
                      width={barW}
                      height={routineH}
                      rx="3"
                      fill="#F59E0B"
                    />
                  )}
                  <text
                    x={cx}
                    y={Math.max(14, padTop + plotH - totalH - 6)}
                    textAnchor="middle"
                    className={`text-[10px] font-mono ${
                      isCurrent ? 'fill-emerald-900 font-bold' : 'fill-slate-600'
                    }`}
                  >
                    {point.totalSpent > 0 ? `R$${Math.round(point.totalSpent)}` : 'R$0'}
                  </text>
                  <text
                    x={cx}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    className={`text-[11px] font-mono ${
                      isCurrent ? 'fill-emerald-900 font-bold' : 'fill-slate-500'
                    }`}
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Category Comparison Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden print-break-avoid">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            Resumo por Tipo / Categoria com Variação Mensal
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparativo entre {formatMonthLabelBR(report.monthKey)} e{' '}
            {formatMonthLabelBR(report.compareMonthKey)}.
          </p>
        </div>

        {report.categories.length === 0 ? (
          <div className="py-10 px-6 text-center text-sm text-slate-500">
            Nenhum gasto registrado neste mês ou no período de comparação.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Categoria</th>
                  <th className="py-3 px-4 text-right">Estocada</th>
                  <th className="py-3 px-4 text-right">Uso Diário</th>
                  <th className="py-3 px-4 text-right">Total Mês</th>
                  <th className="py-3 px-4 text-right">Economia vs Ref.</th>
                  <th className="py-3 px-4 text-right">Mês Comp.</th>
                  <th className="py-3 px-6 text-right">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {report.categories.map((cat) => (
                  <tr key={cat.category} className="hover:bg-slate-50/60">
                    <td className="py-3 px-6 font-medium text-slate-900">{cat.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-800">
                      {formatBRL(cat.stockpileSpent)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-800">
                      {formatBRL(cat.routineSpent)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatBRL(cat.currentSpent)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums text-xs font-medium ${
                        cat.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {cat.netSavings >= 0 ? '+' : ''}
                      {formatBRL(cat.netSavings)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {formatBRL(cat.compareSpent)}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      {cat.diffPercent === null ? (
                        <span className="text-slate-500">
                          {cat.diffAmount > 0 ? `+${formatBRL(cat.diffAmount)}` : 'Novo'}
                        </span>
                      ) : (
                        <span
                          className={`font-semibold ${
                            cat.diffAmount <= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {cat.diffAmount > 0 ? '+' : ''}
                          {formatBRL(cat.diffAmount)} ({cat.diffPercent > 0 ? '+' : ''}
                          {cat.diffPercent}%)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Filterable Item List with Group by Type Option */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Itens Comprados no Mês ({filteredItems.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtre por destino ou agrupe por tipo de categoria para conferência rápida.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 no-print">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setItemFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  itemFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setItemFilter('stockpile')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  itemFilter === 'stockpile' ? 'bg-emerald-700 text-white' : 'text-slate-600'
                }`}
              >
                Estocados
              </button>
              <button
                type="button"
                onClick={() => setItemFilter('routine')}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  itemFilter === 'routine' ? 'bg-amber-600 text-white' : 'text-slate-600'
                }`}
              >
                Uso Diário
              </button>
            </div>

            <button
              type="button"
              onClick={() => setGroupByCategory((prev) => !prev)}
              aria-pressed={groupByCategory}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                groupByCategory
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Agrupar por Tipo</span>
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-10 px-6 text-center text-sm text-slate-500">
            Nenhum item encontrado para o filtro selecionado neste mês.
          </div>
        ) : groupByCategory ? (
          <div className="divide-y divide-slate-200">
            {groupedItems.map(([category, group]) => (
              <div key={category} className="print-break-avoid">
                <div className="px-6 py-2.5 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-800">
                  <span>
                    {category} ({group.items.length} {group.items.length === 1 ? 'item' : 'itens'})
                  </span>
                  <span className="font-mono tabular-nums">
                    Subtotal: {formatBRL(group.subtotal)} ·{' '}
                    <span className={group.savings >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                      {group.savings >= 0 ? '+' : ''}
                      {formatBRL(group.savings)} vs ref.
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {group.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 px-6 font-medium text-slate-900">
                            {item.name}
                            <span className="block text-xs font-normal text-slate-500">
                              {item.storeName} · {formatDateBR(item.purchaseDate)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                item.isStockpile
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
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
                                  <span>Uso Diário</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                            {item.quantity} {item.unit} × {formatBRL(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-6 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatBRL(item.totalPaid)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-6">Data</th>
                  <th className="py-2.5 px-4">Produto / Mercado</th>
                  <th className="py-2.5 px-4">Categoria</th>
                  <th className="py-2.5 px-4">Destino</th>
                  <th className="py-2.5 px-4 text-right">Qtd × Unit.</th>
                  <th className="py-2.5 px-4 text-right">Total Pago</th>
                  <th className="py-2.5 px-6 text-right">vs. Ref.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-6 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatDateBR(item.purchaseDate)}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.storeName}</p>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          item.isStockpile
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-amber-50 text-amber-800'
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
                            <span>Uso Diário</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                      {item.quantity} {item.unit} × {formatBRL(item.unitPrice)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatBRL(item.totalPaid)}
                    </td>
                    <td
                      className={`py-2.5 px-6 text-right font-mono tabular-nums text-xs font-medium whitespace-nowrap ${
                        item.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {item.netSavings >= 0 ? '+' : ''}
                      {formatBRL(item.netSavings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
