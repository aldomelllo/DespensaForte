import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  ShoppingBasket,
  TrendingDown,
} from 'lucide-react';
import type { PriceTrendAnalysis } from '../types/inventory';
import { defaultIsStockpileForCategory, formatBRL, formatDateBR } from '../utils/analytics';

interface PriceEvolutionViewProps {
  trends: PriceTrendAnalysis[];
  selectedProductKey: string | null;
  onSelectProduct: (productKey: string) => void;
}

export function PriceEvolutionView({
  trends,
  selectedProductKey,
  onSelectProduct,
}: PriceEvolutionViewProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [destFilter, setDestFilter] = useState<'all' | 'stockpile' | 'routine'>('all');

  const filteredTrends = trends.filter((t) => {
    if (destFilter === 'all') return true;
    const latest = t.records[t.records.length - 1];
    const isStockpile = latest?.isStockpile ?? defaultIsStockpileForCategory(t.category);
    return destFilter === 'stockpile' ? isStockpile : !isStockpile;
  });

  const activeTrend =
    filteredTrends.find((t) => t.productKey === selectedProductKey) ??
    filteredTrends.find((t) => t.records.length >= 2) ??
    filteredTrends[0] ??
    trends[0] ??
    null;

  useEffect(() => {
    setHoveredIdx(null);
  }, [activeTrend?.productKey]);

  if (!activeTrend) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          Nenhum histórico de preços ainda
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Suba seu primeiro cupom fiscal para começar a acompanhar se está comprando bem ou pagando mais caro.
        </p>
      </div>
    );
  }

  const records = activeTrend.records;
  const prices = records.map((r) => r.unitPrice);
  const rawMin = Math.min(...prices, activeTrend.averagePrice);
  const rawMax = Math.max(...prices, activeTrend.averagePrice);
  const padding = Math.max(0.5, (rawMax - rawMin) * 0.25);
  const minY = Math.max(0, rawMin - padding);
  const maxY = rawMax + padding;
  const spanY = Math.max(0.1, maxY - minY);

  const svgWidth = 680;
  const svgHeight = 260;
  const padLeft = 58;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (index: number) => {
    if (records.length === 1) return padLeft + plotW / 2;
    return padLeft + (index / (records.length - 1)) * plotW;
  };

  const getY = (price: number) => {
    const ratio = (price - minY) / spanY;
    return padTop + plotH - ratio * plotH;
  };

  const polylinePoints = records
    .map((r, i) => `${getX(i).toFixed(1)},${getY(r.unitPrice).toFixed(1)}`)
    .join(' ');

  const avgY = getY(activeTrend.averagePrice);
  const activePoint =
    hoveredIdx !== null && records[hoveredIdx]
      ? records[hoveredIdx]
      : records[records.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Evolução de Preços: Feira &amp; Estocagem
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compare o histórico de cada item para saber se comprou bem (abaixo da média) ou pagou mais caro.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setDestFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              destFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Todos ({trends.length})
          </button>
          <button
            type="button"
            onClick={() => setDestFilter('stockpile')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              destFilter === 'stockpile' ? 'bg-emerald-700 text-white' : 'text-slate-600'
            }`}
          >
            Estocada
          </button>
          <button
            type="button"
            onClick={() => setDestFilter('routine')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              destFilter === 'routine' ? 'bg-amber-600 text-white' : 'text-slate-600'
            }`}
          >
            Rotineira
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Product Selector List */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-semibold text-slate-700">
              Produtos Catalogados ({filteredTrends.length})
            </h2>
          </div>
          <ul className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
            {filteredTrends.map((trend) => {
              const isSelected = trend.productKey === activeTrend.productKey;
              const isDown = trend.changeVsAveragePct <= -5;
              const isUp = trend.changeVsAveragePct >= 5;
              const countLabel =
                trend.records.length === 1 ? '1 compra' : `${trend.records.length} compras`;

              return (
                <li key={trend.productKey}>
                  <button
                    type="button"
                    onClick={() => onSelectProduct(trend.productKey)}
                    className={`w-full text-left px-4 py-3.5 transition-colors flex items-center justify-between gap-3 focus:outline-none focus-visible:bg-emerald-50 ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-900' : 'text-slate-900'}`}>
                        {trend.productName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {countLabel} · {trend.category}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatBRL(trend.latestPrice)}
                      </p>
                      <p
                        className={`text-xs font-medium ${
                          isDown ? 'text-emerald-700' : isUp ? 'text-red-700' : 'text-slate-500'
                        }`}
                      >
                        {trend.changeVsAveragePct > 0
                          ? `+${trend.changeVsAveragePct}%`
                          : `${trend.changeVsAveragePct}%`}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Chart and Detailed Ledger */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500">
                  {activeTrend.category} · Unidade: {activeTrend.unit}
                </p>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {activeTrend.productName}
                </h2>
              </div>

              <div className="text-right">
                {activeTrend.signal === 'ideal_to_stock' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                    <span>Comprou Bem (Abaixo da Média)</span>
                  </span>
                ) : activeTrend.signal === 'above_average' ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    <span>Pagou Mais Caro que a Média</span>
                  </span>
                ) : (
                  <span className="text-sm font-medium text-slate-600">
                    Preço estável na média histórica
                  </span>
                )}
                <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  Menor: {formatBRL(activeTrend.minPrice)} · Maior: {formatBRL(activeTrend.maxPrice)}
                </p>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Último Preço Pago</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatBRL(activeTrend.latestPrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Média Histórica</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-700 mt-0.5">
                  {formatBRL(activeTrend.averagePrice)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">vs. Média Histórica</p>
                <p
                  className={`text-lg font-bold font-mono tabular-nums mt-0.5 inline-flex items-center gap-1 ${
                    activeTrend.changeVsAveragePct <= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {activeTrend.changeVsAveragePct < 0 ? (
                    <TrendingDown className="w-4 h-4" aria-hidden="true" />
                  ) : null}
                  <span>
                    {activeTrend.changeVsAveragePct > 0
                      ? `+${activeTrend.changeVsAveragePct}%`
                      : `${activeTrend.changeVsAveragePct}%`}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">vs. Compra Anterior</p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {activeTrend.changeVsPreviousPct === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        activeTrend.changeVsPreviousPct <= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {activeTrend.changeVsPreviousPct < 0 ? (
                        <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                      ) : activeTrend.changeVsPreviousPct > 0 ? (
                        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      ) : null}
                      <span>
                        {activeTrend.changeVsPreviousPct > 0
                          ? `+${activeTrend.changeVsPreviousPct}%`
                          : `${activeTrend.changeVsPreviousPct}%`}
                      </span>
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Interactive SVG Price Chart */}
            <div className="pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                <span>
                  Ponto selecionado: <strong className="text-slate-900">{formatDateBR(activePoint.purchaseDate)}</strong> · {activePoint.storeName} ·{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {formatBRL(activePoint.unitPrice)}
                  </strong>
                </span>
                <span className="font-mono">Linha tracejada = média ({formatBRL(activeTrend.averagePrice)})</span>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-auto min-w-[460px]"
                  role="img"
                  aria-label={`Gráfico de evolução de preços para ${activeTrend.productName}`}
                >
                  {[0, 0.5, 1].map((t) => {
                    const y = padTop + plotH - t * plotH;
                    const val = minY + t * spanY;
                    return (
                      <g key={t}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={svgWidth - padRight}
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
                          {val.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  <line
                    x1={padLeft}
                    y1={avgY}
                    x2={svgWidth - padRight}
                    y2={avgY}
                    stroke="#64748B"
                    strokeDasharray="5 4"
                    strokeWidth="1.5"
                  />

                  {records.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#15803D"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylinePoints}
                    />
                  )}

                  {records.map((rec, i) => {
                    const cx = getX(i);
                    const cy = getY(rec.unitPrice);
                    const isFocused =
                      hoveredIdx === i || (hoveredIdx === null && i === records.length - 1);

                    return (
                      <g key={rec.id}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isFocused ? 6 : 4.5}
                          fill={isFocused ? '#15803D' : '#FFFFFF'}
                          stroke="#15803D"
                          strokeWidth="2.5"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredIdx(i)}
                          onClick={() => setHoveredIdx(i)}
                        />
                        <text
                          x={cx}
                          y={svgHeight - 10}
                          textAnchor="middle"
                          className="fill-slate-500 text-[11px] font-mono"
                        >
                          {formatDateBR(rec.purchaseDate).slice(0, 5)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </section>

          {/* Historical Ledger */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Histórico de Compras Catalogadas
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-6">Data Compra</th>
                    <th className="py-2.5 px-4">Estabelecimento</th>
                    <th className="py-2.5 px-4">Destino</th>
                    <th className="py-2.5 px-4 text-right">Quantidade</th>
                    <th className="py-2.5 px-4 text-right">Preço Unit.</th>
                    <th className="py-2.5 px-6 text-right">Ref. na Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {[...records].reverse().map((rec) => {
                    const isStock =
                      rec.isStockpile ?? defaultIsStockpileForCategory(rec.category);
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-6 font-mono tabular-nums text-xs text-slate-700">
                          {formatDateBR(rec.purchaseDate)}
                        </td>
                        <td className="py-3 px-4 text-slate-900">{rec.storeName}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
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
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {rec.quantity} {rec.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatBRL(rec.unitPrice)}
                        </td>
                        <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-500">
                          {formatBRL(rec.referencePrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
