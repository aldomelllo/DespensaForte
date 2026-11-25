import { useRef, useState } from 'react';
import {
  BellRing,
  Check,
  Download,
  Eraser,
  KeyRound,
  LogOut,
  RotateCcw,
  Share2,
  Shield,
  Upload,
} from 'lucide-react';
import type { AlertSettings, AppState, InventoryItem } from '../types/inventory';
import type { AuthUser } from '../types/auth';
import { changeMyPassword } from '../services/api';
import {
  buildExpiryAlertMessage,
  dispatchLocalPushNotification,
  getNotificationPermissionState,
  requestPushPermission,
  type PushSupportState,
} from '../utils/notifications';
import { formatDateBR, hasValidExpiryDate } from '../utils/analytics';
import { exportStateAsJson, parseImportedState } from '../utils/storage';

interface SettingsAlertsViewProps {
  appState: AppState;
  currentUser: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
  onUpdateSettings: (settings: AlertSettings) => void;
  onImportState: (newState: AppState) => void;
  onResetDemoData: () => void;
  onStartCleanPantry: () => void;
}

export function SettingsAlertsView({
  appState,
  currentUser,
  onUserUpdated,
  onLogout,
  onUpdateSettings,
  onImportState,
  onResetDemoData,
  onStartCleanPantry,
}: SettingsAlertsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [permission, setPermission] = useState<PushSupportState>(() =>
    getNotificationPermissionState()
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const [confirmClean, setConfirmClean] = useState(false);

  // Troca de senha própria
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const { settings, inventory } = appState;
  const expiryDigest = buildExpiryAlertMessage(
    inventory,
    settings.warningDays,
    settings.criticalDays
  );

  async function handleEnablePush() {
    setFeedback(null);
    setErrorMsg(null);
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
    setErrorMsg(null);
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setErrorMsg(null);

    if (!currentPassword || !newPassword) {
      setErrorMsg('Informe a senha atual e a nova senha.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('A confirmação da nova senha não confere.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const updated = await changeMyPassword(currentPassword, newPassword);
      onUserUpdated(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setFeedback('Sua senha foi alterada com sucesso!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleShareAppLink() {
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'DespensaForte — Controle de Gastos de Feira e Estocagem',
          text: 'Acesse sua conta do DespensaForte:',
          url: cleanUrl,
        });
        setFeedback('Link de acesso do app compartilhado!');
        return;
      }
      if (navigator.clipboard && 'writeText' in navigator.clipboard) {
        await navigator.clipboard.writeText(cleanUrl);
        setCopiedAppLink(true);
        setFeedback('Link de acesso do app copiado!');
        setTimeout(() => setCopiedAppLink(false), 4000);
        return;
      }
      window.prompt('Copie o link de acesso do DespensaForte:', cleanUrl);
    } catch {
      window.prompt('Copie o link de acesso do DespensaForte:', cleanUrl);
    }
  }

  function handleExportBackup() {
    const json = exportStateAsJson(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despensaforte-backup-${currentUser.username}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback('Backup da sua conta exportado em JSON.');
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseImportedState(text);
      onImportState(parsed);
      setFeedback('Backup JSON restaurado na sua conta com sucesso.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar JSON.');
    }
  }

  const expiringList: Array<{ item: InventoryItem }> = inventory
    .filter((i) => i.quantity > 0 && hasValidExpiryDate(i.expiryDate))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
    .slice(0, 5)
    .map((item) => ({ item }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Ajustes, Conta e Segurança
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Gerencie sua senha, parâmetros da casa para autonomia, alertas de validade e backup dos seus dados privados.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div role="status" className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 text-sm text-emerald-900">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Account + Parameters */}
        <div className="lg:col-span-7 space-y-6">
          {/* Account & Change Password */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Minha Conta ({currentUser.displayName})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Usuário: <strong className="font-mono text-slate-800">{currentUser.username}</strong> · Perfil:{' '}
                  <strong className="text-slate-800">
                    {currentUser.role === 'admin' ? 'Administrador (ADM)' : 'Cliente'}
                  </strong>
                  {' · '}
                  OCR no mês:{' '}
                  <strong className="font-mono text-emerald-800">
                    {currentUser.role === 'admin'
                      ? `${currentUser.ocrUsedThisMonth} / Ilimitado`
                      : `${currentUser.ocrUsedThisMonth} / ${currentUser.ocrMonthlyLimit}`}
                  </strong>
                </p>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sair da conta</span>
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <KeyRound className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>Alterar Minha Senha</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="cur-pass" className="block text-xs text-slate-600 mb-1">
                    Senha atual
                  </label>
                  <input
                    id="cur-pass"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="new-pass" className="block text-xs text-slate-600 mb-1">
                    Nova senha
                  </label>
                  <input
                    id="new-pass"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-new-pass" className="block text-xs text-slate-600 mb-1">
                    Confirmar nova senha
                  </label>
                  <input
                    id="confirm-new-pass"
                    type="password"
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg"
                >
                  {isChangingPassword ? 'Salvando...' : 'Atualizar Senha'}
                </button>
              </div>
            </form>
          </section>

          {/* Parameters & Push Notifications Panel */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Parâmetros da Casa e Notificações de Validade
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permissão push no navegador:{' '}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div>
                <label htmlFor="setting-daily-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  Custo diário alimentar por pessoa (R$)
                </label>
                <input
                  id="setting-daily-cost"
                  type="number"
                  min="1"
                  step="1"
                  value={settings.dailyCostPerPerson}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      dailyCostPerPerson: Math.max(1, parseFloat(e.target.value) || 25),
                    })
                  }
                  className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Usado para estimar dias de autonomia pelo valor investido na Despensa Estocada.
                </p>
              </div>

              <div>
                <label htmlFor="setting-warning-days" className="block text-xs font-medium text-slate-700 mb-1">
                  Alerta preventivo (dias antes do vencimento)
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
                  Alerta crítico (dias antes do vencimento)
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
                  Nenhum item com validade informada vence dentro da janela de {settings.warningDays} dias.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Privacy, Cloud Sync & Backup */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Privacidade na Nuvem e Backup
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Seus dados são sincronizados na nuvem e isolados apenas na sua conta ({currentUser.username}). Ninguém mais tem acesso.
              </p>
            </div>
            <Shield className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
          </div>

          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              Registros na sua conta:{' '}
              <strong className="font-mono text-slate-900">{appState.inventory.length}</strong> itens ·{' '}
              <strong className="font-mono text-slate-900">{appState.priceHistory.length}</strong> cotações ·{' '}
              <strong className="font-mono text-slate-900">{appState.receipts.length}</strong> cupons
            </p>
            <p>
              Você pode acessar sua despensa do celular ou do computador com seu usuário e senha.
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleShareAppLink}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              {copiedAppLink ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Share2 className="w-4 h-4" aria-hidden="true" />
              )}
              <span>Compartilhar Link do App</span>
            </button>

            {!confirmClean ? (
              <button
                type="button"
                onClick={() => setConfirmClean(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg"
              >
                <Eraser className="w-4 h-4" aria-hidden="true" />
                <span>Começar Minha Despensa Limpa (Zero)</span>
              </button>
            ) : (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 space-y-2">
                <p className="text-xs font-medium text-amber-950">
                  Isso apagará todos os itens, cupons e histórico da sua conta para começar do zero. Deseja continuar?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onStartCleanPantry();
                      setConfirmClean(false);
                      setFeedback('Despensa limpa! Você começou do zero e já pode escanear seu primeiro cupom.');
                    }}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md"
                  >
                    Sim, zerar tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClean(false)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Exportar Backup (.JSON)</span>
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
                setConfirmClean(false);
                setFeedback('Dados de demonstração carregados na sua conta.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Carregar Dados de Demonstração</span>
            </button>
          </div>

          {expiringList.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-700 mb-2">
                Próximos 5 lotes na fila PEPS (com validade)
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {expiringList.map(({ item }) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="truncate">{item.name}</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {formatDateBR(item.expiryDate)}
                    </span>
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
