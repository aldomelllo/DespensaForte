import { Camera, Cloud, LogOut, Shield } from 'lucide-react';
import type { AuthUser } from '../types/auth';

export type ActiveTab =
  | 'dashboard'
  | 'inventory'
  | 'prices'
  | 'receipts'
  | 'report'
  | 'alerts'
  | 'admin';

interface TopBarProps {
  activeTab: ActiveTab;
  currentUser: AuthUser | null;
  syncStatus?: 'idle' | 'saving' | 'saved' | 'error';
  onSelectTab: (tab: ActiveTab) => void;
  onOpenScanner: () => void;
  onLogout?: () => void;
}

const BASE_NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'dashboard', label: 'Visão Geral' },
  { id: 'inventory', label: 'Despensa' },
  { id: 'prices', label: 'Preços' },
  { id: 'receipts', label: 'Cupons' },
  { id: 'report', label: 'Relatório' },
  { id: 'alerts', label: 'Ajustes' },
];

export function TopBar({
  activeTab,
  currentUser,
  syncStatus = 'idle',
  onSelectTab,
  onOpenScanner,
  onLogout,
}: TopBarProps) {
  const navItems =
    currentUser?.role === 'admin'
      ? [...BASE_NAV_ITEMS, { id: 'admin' as ActiveTab, label: 'ADM' }]
      : BASE_NAV_ITEMS;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-4">
        <div className="h-14 md:h-16 flex items-center gap-2.5 shrink-0">
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
          {syncStatus === 'saving' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Cloud className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
              <span>Salvando...</span>
            </span>
          )}
          {syncStatus === 'saved' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Nuvem OK</span>
            </span>
          )}
        </div>

        <nav
          aria-label="Navegação principal"
          className="order-3 md:order-2 w-full md:w-auto border-t md:border-t-0 border-slate-100 flex items-center justify-between md:justify-center gap-3 md:gap-5 overflow-x-auto"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isAdminTab = item.id === 'admin';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-2.5 md:py-5 text-xs md:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  isActive
                    ? 'border-emerald-700 text-slate-900'
                    : isAdminTab
                      ? 'border-transparent text-emerald-800 hover:text-emerald-900 hover:border-emerald-300'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {isAdminTab && <Shield className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="order-2 md:order-3 h-14 md:h-16 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenScanner}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700"
          >
            <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Escanear Cupom</span>
            <span className="sm:hidden">Cupom</span>
          </button>

          {currentUser && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={`Sair da conta (${currentUser.displayName})`}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
