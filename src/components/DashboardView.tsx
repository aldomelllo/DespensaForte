import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import type {
  CategoryId,
  CategorySavingsSummary,
  DashboardKpis,
  InventoryItem,
  PriceTrendAnalysis,
} from '../types/inventory';
import {
  calculateDaysUntilExpiry,
  formatBRL,
  formatDateBR,
  getExpiryStatus,
} from '../utils/analytics';

interface DashboardViewProps {
  kpis: DashboardKpis;
  categorySavings: CategorySavingsSummary[];
  priceTrends: PriceTrendAnalysis[];
  inventory: InventoryItem[];
  warningDays: number;
  criticalDays: number;
  onNavigateTab: (tab: 'inventory' | 'prices' | 'receipts' | 'alerts') => void;
  onSelectProductForTrend: (productKey: string) => void;
  onSelectCategoryFilter: (category: CategoryId | 'Todas') => void;
  onOpenScanner: () => void;
}

export function DashboardView({
  kpis,
  categorySavings,
  priceTrends,
  inventory,
  warningDays,
  criticalDays,
  onNavigateTab,
  onSelectProductForTrend,
  onSelectCategoryFilter,
  onOpenScanner,
}: DashboardViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | 'Todas'>('Todas');

  const maxCategoryAbs = Math.max(
    1,
    ...categorySavings.map((c) => Math.max(Math.abs(c.netSavings), c.totalSpent * 0.3))
  );

  const opportunities = priceTrends.filter((t) =>
    selectedCategory === 'Todas' ? true : t.category === selectedCategory
  );

  const expiringItems = inventory
    .filter((item) => item.quantity > 0)
    .filter((item) => (selectedCategory === 'Todas' ? true : item.category === selectedCategory))
    .map((item) => ({
      item,
      days: calculateDaysUntilExpiry(item.expiryDate),
      status: getExpiryStatus(item.expiryDate, warningDays, criticalDays),
    }))
    .filter((entry) => entry.status === 'expired' || entry.status === 'critical' || entry.status === 'warning')
    .sort((a, b) => a.days - b.days);

  const totalAlerts = kpis.expiredCount + kpis.expiringSoonCount;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Painel de Estoque e Economia
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Controle doméstico e sobrevivencialismo com base nos cupons fiscais armazenados localmente.
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <label htmlFor="dashboard-category-filter" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Filtrar categoria:
          </label>
          <select
            id="dashboard-category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as CategoryId | 'Todas')}
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <option value="Todas">Todas as categorias</option>
            {categorySavings.map((cat) => (
              <option key={cat.category} value={cat.category}>
                {cat.category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4-KPI Strip */}
      <section aria-label="Indicadores principais" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Economia Acumulada</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              data-testid="kpi-total-savings"
              className={`text-2xl font-bold font-mono tabular-nums ${
                kpis.totalSavings >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatBRL(kpis.totalSavings)}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {kpis.savingsPercent >= 0 ? `+${kpis.savingsPercent}%` : `${kpis.savingsPercent}%`} vs ref.
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sobre {formatBRL(kpis.totalSpent)} gastos em compras
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Valor em Despensa</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span data-testid="kpi-stock-value" className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatBRL(kpis.totalStockValue)}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              {kpis.totalUnits} un.
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {kpis.uniqueProductsCount} produtos catalogados ativos
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Autonomia Sobrevivencialista</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.survivalReserveDays} dias
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{kpis.belowAverageSharePct}% bom preço</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Estimativa de reserva alimentar e água
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Alertas de Validade</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              data-testid="kpi-expiry-alerts"
              className={`text-2xl font-bold font-mono tabular-nums ${
                totalAlerts > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {totalAlerts}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('alerts')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Configurar Push</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {kpis.expiredCount} vencidos · {kpis.expiringSoonCount} em até {warningDays}d
          </p>
        </div>
      </section>

      {/* Main Analytics Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Category Accumulated Savings */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Economia Acumulada por Categoria
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Diferença entre o preço pago nos cupons e a referência de mercado ou média histórica.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenScanner}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              + Novo cupom
            </button>
          </div>

          {categorySavings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-600">Nenhuma compra registrada ainda.</p>
              <button
                type="button"
                onClick={onOpenScanner}
                className="mt-3 px-4 py-2 text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
              >
                Importar Primeiro Cupom
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {categorySavings.map((cat) => {
                const barWidth = Math.min(
                  100,
                  Math.max(6, Math.round((Math.abs(cat.netSavings) / maxCategoryAbs) * 100))
                );
                const isPositive = cat.netSavings >= 0;
                const isSelected = selectedCategory === cat.category;

                return (
                  <div key={cat.category} className="group">
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(isSelected ? 'Todas' : cat.category);
                        }}
                        className={`text-left font-medium transition-colors hover:text-emerald-700 focus:outline-none focus-visible:underline ${
                          isSelected ? 'text-emerald-700 underline' : 'text-slate-900'
                        }`}
                      >
                        {cat.category}
                      </button>
                      <div className="flex items-baseline gap-3 shrink-0 font-mono tabular-nums text-xs">
                        <span className="text-slate-500">
                          Gasto {formatBRL(cat.totalSpent)}
                        </span>
                        <span
                          className={`font-semibold ${
                            isPositive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {formatBRL(cat.netSavings)} ({isPositive ? '+' : ''}
                          {cat.savingsPercent}%)
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 h-2.5 w-full bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isPositive ? 'bg-emerald-600' : 'bg-red-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {cat.activeStockUnits} un. em estoque · Valor atual {formatBRL(cat.activeStockValue)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCategoryFilter(cat.category);
                          onNavigateTab('inventory');
                        }}
                        className="text-slate-600 hover:text-slate-900 font-medium"
                      >
                        Ver itens →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Expiration Alerts */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Rotação PEPS e Vencimentos
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Itens com validade nos próximos {warningDays} dias.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('alerts')}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Alertas</span>
            </button>
          </div>

          {expiringItems.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-900">Nenhum item próximo do vencimento</p>
              <p className="text-xs text-slate-500">
                Todos os lotes estocados estão dentro do prazo seguro.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 mt-2">
              {expiringItems.slice(0, 6).map(({ item, days, status }) => {
                const statusLabel =
                  status === 'expired'
                    ? `Vencido há ${Math.abs(days)}d`
                    : days === 0
                      ? 'Vence hoje'
                      : `Vence em ${days}d`;
                const statusColor =
                  status === 'expired' || status === 'critical'
                    ? 'text-red-700'
                    : 'text-amber-700';

                return (
                  <li key={item.id} className="py-3.5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.category} · {item.quantity} {item.unit} · Val. {formatDateBR(item.expiryDate)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium font-mono tabular-nums whitespace-nowrap shrink-0 ${statusColor}`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{statusLabel}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Regra PEPS: consuma primeiro o que vence antes.
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              Gerenciar estoque →
            </button>
          </div>
        </section>
      </div>

      {/* Survivalist Price Opportunities Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Monitor de Estocagem e Preços Históricos
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare a última compra registrada contra o preço médio histórico para decidir o momento de estocar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('prices')}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
          >
            Abrir gráficos de evolução →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Produto</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4 text-right">Último Pago</th>
                <th className="py-3 px-4 text-right">Média Histórica</th>
                <th className="py-3 px-4 text-right">Variação</th>
                <th className="py-3 px-6 text-right">Sinal p/ Sobrevivencialismo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {opportunities.slice(0, 8).map((trend) => {
                const isCheaper = trend.changeVsAveragePct <= -5;
                const isHigher = trend.changeVsAveragePct >= 5;

                return (
                  <tr
                    key={trend.productKey}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-6 font-medium text-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProductForTrend(trend.productKey);
                          onNavigateTab('prices');
                        }}
                        className="text-left hover:text-emerald-700 hover:underline focus:outline-none focus-visible:underline"
                      >
                        {trend.productName}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {trend.category}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatBRL(trend.latestPrice)}/{trend.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatBRL(trend.averagePrice)}/{trend.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={`inline-flex items-center justify-end gap-1 font-medium ${
                          isCheaper
                            ? 'text-emerald-700'
                            : isHigher
                              ? 'text-red-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {trend.changeVsAveragePct < 0 ? (
                          <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : trend.changeVsAveragePct > 0 ? (
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : null}
                        <span>
                          {trend.changeVsAveragePct > 0
                            ? `+${trend.changeVsAveragePct}%`
                            : `${trend.changeVsAveragePct}%`}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right whitespace-nowrap">
                      {trend.signal === 'ideal_to_stock' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Bom para estocar</span>
                        </span>
                      ) : trend.signal === 'above_average' ? (
                        <span className="text-xs font-medium text-red-700">
                          Acima da média · Aguardar
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">Preço estável</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
