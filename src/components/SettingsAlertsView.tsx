import { useRef, useState } from 'react';
import { BellRing, Download, RotateCcw, Shield, Upload } from 'lucide-react';
import type { AlertSettings, AppState, InventoryItem } from '../types/inventory';
import {
  buildExpiryAlertMessage,
  dispatchLocalPushNotification,
  getNotificationPermissionState,
  requestPushPermission,
  type PushSupportState,
} from '../utils/notifications';
import { exportStateAsJson, parseImportedState } from '../utils/storage';

interface SettingsAlertsViewProps {
  appState: AppState;
  onUpdateSettings: (settings: AlertSettings) => void;
  onImportState: (newState: AppState) => void;
  onResetDemoData: () => void;
}

export function SettingsAlertsView({
  appState,
  onUpdateSettings,
  onImportState,
  onResetDemoData,
}: SettingsAlertsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [permission, setPermission] = useState<PushSupportState>(() =>
    getNotificationPermissionState()
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const { settings, inventory } = appState;
  const expiryDigest = buildExpiryAlertMessage(
    inventory,
    settings.warningDays,
    settings.criticalDays
  );

  async function handleEnablePush() {
    setFeedback(null);
    const nextPerm = await requestPushPermission();
    setPermission(nextPerm);
    if (nextPerm === 'granted') {
      onUpdateSettings({ ...settings, pushEnabled: true });
      const msg = expiryDigest ?? {
        title: 'DespensaForte: Alertas Ativados',
        body: 'Você receberá notificações locais sempre que houver itens próximos do vencimento.',
      };
      await dispatchLocalPushNotification(msg.title, msg.body);
      setFeedback('Notificações push ativadas neste navegador e alerta inicial enviado.');
    } else if (nextPerm === 'denied') {
      setFeedback('Permissão bloqueada pelo navegador. Libere notificações nas configurações do site.');
    } else if (nextPerm === 'unsupported') {
      setFeedback('Este navegador não suporta a API de notificações push.');
    }
  }

  async function handleTestPush() {
    setFeedback(null);
    if (permission !== 'granted') {
      await handleEnablePush();
      return;
    }
    const msg = expiryDigest ?? {
      title: 'DespensaForte: Verificação de Validade',
      body: 'Nenhum lote crítico encontrado no momento. Sua rotação PEPS está em dia.',
    };
    const res = await dispatchLocalPushNotification(msg.title, msg.body);
    if (res.sent) {
      setFeedback(`Notificação push disparada (${res.method}): "${msg.title}".`);
    } else {
      setFeedback('Não foi possível enviar a notificação neste ambiente.');
    }
  }

  function handleExportBackup() {
    const json = exportStateAsJson(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despensaforte-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback('Backup local exportado em JSON.');
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseImportedState(text);
      onImportState(parsed);
      setFeedback('Backup JSON restaurado localmente com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao importar JSON.');
    }
  }

  const expiringList: Array<{ item: InventoryItem }> = inventory
    .filter((i) => i.quantity > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 5)
    .map((item) => ({ item }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Alertas Push e Armazenamento Local
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure notificações de vencimento no navegador e gerencie o backup offline do seu estoque.
        </p>
      </div>

      {feedback && (
        <div role="status" className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-sm text-emerald-900">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Push Notifications Panel */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Notificações Push de Validade
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Status da permissão no navegador:{' '}
                <strong className="text-slate-900">
                  {permission === 'granted'
                    ? 'Autorizado'
                    : permission === 'denied'
                      ? 'Bloqueado'
                      : permission === 'unsupported'
                        ? 'Indisponível'
                        : 'Aguardando ativação'}
                </strong>
              </p>
            </div>
            <BellRing className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="setting-warning-days" className="block text-xs font-medium text-slate-700 mb-1">
                Alerta preventivo (dias)
              </label>
              <input
                id="setting-warning-days"
                type="number"
                min="1"
                max="365"
                value={settings.warningDays}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    warningDays: Math.max(1, parseInt(e.target.value, 10) || 30),
                  })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="setting-critical-days" className="block text-xs font-medium text-slate-700 mb-1">
                Alerta crítico (dias)
              </label>
              <input
                id="setting-critical-days"
                type="number"
                min="1"
                max="90"
                value={settings.criticalDays}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    criticalDays: Math.max(1, parseInt(e.target.value, 10) || 7),
                  })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="setting-household" className="block text-xs font-medium text-slate-700 mb-1">
                Pessoas na casa
              </label>
              <input
                id="setting-household"
                type="number"
                min="1"
                max="20"
                value={settings.householdSize}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    householdSize: Math.max(1, parseInt(e.target.value, 10) || 2),
                  })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleEnablePush}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              {permission === 'granted' ? 'Revalidar Permissão Push' : 'Ativar Notificações Push'}
            </button>
            <button
              type="button"
              onClick={handleTestPush}
              className="px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Disparar Notificação de Teste
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-700">Prévia do Próximo Alerta</p>
            {expiryDigest ? (
              <div className="mt-2 p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-sm font-semibold text-slate-900">{expiryDigest.title}</p>
                <p className="text-xs text-slate-600 mt-1">{expiryDigest.body}</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Nenhum item vence dentro da janela configurada de {settings.warningDays} dias.
              </p>
            )}
          </div>
        </section>

        {/* Local Storage & Portability */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Privacidade e Dados Locais
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Todo o seu estoque, histórico de preços e cupons ficam salvos no seu navegador.
              </p>
            </div>
            <Shield className="w-5 h-5 text-slate-700 shrink-0" aria-hidden="true" />
          </div>

          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              Registros salvos: <strong className="font-mono text-slate-900">{appState.inventory.length}</strong> lotes em estoque ·{' '}
              <strong className="font-mono text-slate-900">{appState.priceHistory.length}</strong> cotações ·{' '}
              <strong className="font-mono text-slate-900">{appState.receipts.length}</strong> cupons
            </p>
            <p>
              O envio externo ocorre apenas quando você envia uma foto de cupom para leitura OCR.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Exportar Backup Local (.JSON)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Restaurar Backup (.JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onResetDemoData();
                setFeedback('Dados restaurados para o conjunto inicial de demonstração.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Restaurar Dados de Demonstração</span>
            </button>
          </div>

          {expiringList.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-700 mb-2">
                Próximos 5 lotes na fila PEPS
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {expiringList.map(({ item }) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono tabular-nums shrink-0">{item.expiryDate}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
