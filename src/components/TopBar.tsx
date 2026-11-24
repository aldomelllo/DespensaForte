import { Camera } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'inventory' | 'prices' | 'receipts' | 'alerts';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenScanner: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'dashboard', label: 'Visão Geral' },
  { id: 'inventory', label: 'Estoque' },
  { id: 'prices', label: 'Preços' },
  { id: 'receipts', label: 'Cupons' },
  { id: 'alerts', label: 'Alertas' },
];

export function TopBar({ activeTab, onSelectTab, onOpenScanner }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-8">
        <div className="h-14 md:h-16 flex items-center shrink-0">
          <a
            href="#visao-geral"
            onClick={(e) => {
              e.preventDefault();
              onSelectTab('dashboard');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded"
          >
            DespensaForte
          </a>
        </div>

        <nav
          aria-label="Navegação principal"
          className="order-3 md:order-2 w-full md:w-auto border-t md:border-t-0 border-slate-100 flex items-center justify-between md:justify-center gap-4 md:gap-6 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-2.5 md:py-5 text-xs md:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  isActive
                    ? 'border-emerald-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="order-2 md:order-3 h-14 md:h-16 flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenScanner}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700"
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Escanear Cupom</span>
          </button>
        </div>
      </div>
    </header>
  );
}
