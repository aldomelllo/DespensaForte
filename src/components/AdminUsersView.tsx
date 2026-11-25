import { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { AuthUser } from '../types/auth';
import {
  adminCreateClient,
  adminDeleteClient,
  adminListUsers,
  adminUpdateClient,
} from '../services/api';
import { formatDateBR } from '../utils/analytics';

interface AdminUsersViewProps {
  currentUser: AuthUser;
}

function generateReadablePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const part = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `df-${part(4)}-${part(3)}`;
}

export function AdminUsersView({ currentUser }: AdminUsersViewProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Formulário novo cliente
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generateReadablePassword());
  const [ocrMonthlyLimit, setOcrMonthlyLimit] = useState('30');
  const [notes, setNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Credenciais recém-criadas/redefinidas para copiar e enviar no WhatsApp
  const [recentCredentials, setRecentCredentials] = useState<{
    displayName: string;
    username: string;
    password: string;
    limit: number;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Ações inline na tabela
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [editingLimitUserId, setEditingLimitUserId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState('30');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function loadUsers() {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await adminListUsers();
      setUsers(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar usuários.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setFeedback(null);

    if (!displayName.trim() || !username.trim() || !password.trim()) {
      setErrorMsg('Preencha nome, usuário e senha inicial do cliente.');
      return;
    }

    const parsedLimit = Math.max(0, parseInt(ocrMonthlyLimit, 10) || 0);
    setIsCreating(true);
    try {
      const created = await adminCreateClient({
        displayName: displayName.trim(),
        username: username.trim(),
        password: password.trim(),
        ocrMonthlyLimit: parsedLimit,
        notes: notes.trim() || undefined,
      });
      setUsers((prev) => [...prev, created]);
      setRecentCredentials({
        displayName: created.displayName,
        username: created.username,
        password: password.trim(),
        limit: created.ocrMonthlyLimit,
      });
      setDisplayName('');
      setUsername('');
      setPassword(generateReadablePassword());
      setNotes('');
      setFeedback(`Cliente "${created.displayName}" criado com sucesso!`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível criar o cliente.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(user: AuthUser) {
    setBusyUserId(user.id);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const updated = await adminUpdateClient({
        id: user.id,
        active: !user.active,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setFeedback(
        updated.active
          ? `Acesso de "${updated.displayName}" reativado.`
          : `Acesso de "${updated.displayName}" bloqueado imediatamente.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao alterar status.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleSaveLimit(user: AuthUser) {
    const nextLimit = Math.max(0, parseInt(editingLimitValue, 10) || 0);
    setBusyUserId(user.id);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const updated = await adminUpdateClient({
        id: user.id,
        ocrMonthlyLimit: nextLimit,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingLimitUserId(null);
      setFeedback(`Limite de OCR de "${updated.displayName}" atualizado para ${nextLimit}/mês.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar limite.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleSaveNewPassword(user: AuthUser) {
    if (resetPasswordValue.trim().length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setBusyUserId(user.id);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const updated = await adminUpdateClient({
        id: user.id,
        newPassword: resetPasswordValue.trim(),
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setRecentCredentials({
        displayName: updated.displayName,
        username: updated.username,
        password: resetPasswordValue.trim(),
        limit: updated.ocrMonthlyLimit,
      });
      setResettingUserId(null);
      setResetPasswordValue('');
      setFeedback(`Senha de "${updated.displayName}" redefinida (sessões antigas desconectadas).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteUser(user: AuthUser) {
    setBusyUserId(user.id);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await adminDeleteClient(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setConfirmDeleteId(null);
      setFeedback(`Conta e dados isolados de "${user.displayName}" excluídos.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao excluir cliente.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCopyCredentialsMessage() {
    if (!recentCredentials) return;
    const appUrl = `${window.location.origin}${window.location.pathname}`;
    const msg = [
      `Olá ${recentCredentials.displayName}! Seu acesso ao DespensaForte está pronto:`,
      `Link: ${appUrl}`,
      `Usuário: ${recentCredentials.username}`,
      `Senha: ${recentCredentials.password}`,
      recentCredentials.limit > 0
        ? `Cota de leitura por foto (OCR): ${recentCredentials.limit} cupons/mês`
        : '',
      'Dica: depois de entrar, você pode trocar sua senha na aba Ajustes.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(msg);
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 3500);
    } catch {
      window.prompt('Copie a mensagem de acesso para enviar ao cliente:', msg);
    }
  }

  const clients = users.filter((u) => u.role === 'user');
  const activeClientsCount = clients.filter((u) => u.active).length;
  const blockedClientsCount = clients.length - activeClientsCount;
  const totalOcrMonth = users.reduce((acc, u) => acc + u.ocrUsedThisMonth, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Painel do Administrador (ADM)</span>
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Gestão de Clientes e Limites de OCR
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Crie usuário e senha para quem comprar a solução, controle o limite mensal de fotos (OCR) e bloqueie ou reative acessos. Os dados de cada cliente ficam 100% isolados.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadUsers()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Atualizar lista</span>
        </button>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total de Clientes</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {clients.length}
          </p>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-4">
          <p className="text-xs text-emerald-800">Clientes Ativos</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-800">
            {activeClientsCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Bloqueados</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-red-700">
            {blockedClientsCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Fotos OCR usadas no mês</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {totalOcrMonth}
          </p>
        </div>
      </section>

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-800">
          {errorMsg}
        </div>
      )}

      {feedback && (
        <div role="status" className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Box pronto para copiar e mandar no WhatsApp */}
      {recentCredentials && (
        <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-emerald-950 space-y-1">
            <p className="font-semibold text-sm">
              Dados de acesso prontos para enviar para {recentCredentials.displayName}:
            </p>
            <p className="font-mono">
              Usuário: <strong>{recentCredentials.username}</strong> · Senha:{' '}
              <strong>{recentCredentials.password}</strong> · OCR: {recentCredentials.limit}/mês
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyCredentialsMessage}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shrink-0"
          >
            {copiedCreds ? (
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{copiedCreds ? 'Copiado!' : 'Copiar mensagem p/ WhatsApp'}</span>
          </button>
        </div>
      )}

      {/* Formulário Novo Cliente */}
      <form
        onSubmit={handleCreateClient}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-emerald-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900">
            Cadastrar Novo Cliente (Comprador)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="new-client-name" className="block text-xs font-medium text-slate-700 mb-1">
              Nome do Cliente
            </label>
            <input
              id="new-client-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Maria Silva"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="new-client-username" className="block text-xs font-medium text-slate-700 mb-1">
              Usuário / E-mail de Login
            </label>
            <input
              id="new-client-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ex: maria ou maria@gmail.com"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="new-client-pass" className="block text-xs font-medium text-slate-700">
                Senha Inicial
              </label>
              <button
                type="button"
                onClick={() => setPassword(generateReadablePassword())}
                className="text-[11px] font-medium text-emerald-700 hover:underline"
              >
                Gerar senha
              </button>
            </div>
            <input
              id="new-client-pass"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm font-mono border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="new-client-limit" className="block text-xs font-medium text-slate-700 mb-1">
              Limite Fotos OCR / mês
            </label>
            <input
              id="new-client-limit"
              type="number"
              min="0"
              max="1000"
              value={ocrMonthlyLimit}
              onChange={(e) => setOcrMonthlyLimit(e.target.value)}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="new-client-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Observação (opcional)
            </label>
            <input
              id="new-client-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: WhatsApp / Plano"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="w-4 h-4" aria-hidden="true" />
            )}
            <span>Criar Usuário e Gerar Acesso</span>
          </button>
        </div>
      </form>

      {/* Tabela de Usuários */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">
              Contas Cadastradas ({users.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Cada cliente só enxerga a própria despensa
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Carregando contas...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Cliente / Usuário</th>
                  <th className="py-3 px-4">Perfil</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">OCR no Mês</th>
                  <th className="py-3 px-4">Criado / Último Acesso</th>
                  <th className="py-3 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => {
                  const isAdminRow = u.role === 'admin';
                  const isSelf = u.id === currentUser.id;
                  const isBusy = busyUserId === u.id;
                  const pct =
                    u.ocrMonthlyLimit > 0
                      ? Math.min(100, Math.round((u.ocrUsedThisMonth / u.ocrMonthlyLimit) * 100))
                      : 0;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-6">
                        <p className="font-medium text-slate-900">{u.displayName}</p>
                        <p className="text-xs font-mono text-slate-500">{u.username}</p>
                        {u.notes && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{u.notes}</p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isAdminRow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-white">
                            <Shield className="w-3 h-3" aria-hidden="true" />
                            <span>ADM</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            Cliente
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Ativo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                            <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Bloqueado</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isAdminRow ? (
                          <span className="text-xs font-mono text-slate-600">
                            {u.ocrUsedThisMonth} / Ilimitado
                          </span>
                        ) : editingLimitUserId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={editingLimitValue}
                              onChange={(e) => setEditingLimitValue(e.target.value)}
                              className="w-16 text-xs font-mono border border-slate-300 rounded px-1.5 py-1"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleSaveLimit(u)}
                              className="px-2 py-1 text-[11px] font-medium text-white bg-emerald-700 rounded"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLimitUserId(null)}
                              className="px-1.5 py-1 text-[11px] text-slate-600"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1 min-w-[110px]">
                            <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                              <span
                                className={
                                  u.ocrUsedThisMonth >= u.ocrMonthlyLimit && u.ocrMonthlyLimit > 0
                                    ? 'text-red-700 font-semibold'
                                    : 'text-slate-700'
                                }
                              >
                                {u.ocrUsedThisMonth} / {u.ocrMonthlyLimit}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLimitUserId(u.id);
                                  setEditingLimitValue(String(u.ocrMonthlyLimit));
                                }}
                                title="Editar limite mensal de OCR"
                                className="text-slate-400 hover:text-emerald-700"
                              >
                                <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-600'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        <div>Criado: {formatDateBR(u.createdAt)}</div>
                        <div className="text-slate-400">
                          Último: {u.lastLoginAt ? formatDateBR(u.lastLoginAt) : 'Nunca entrou'}
                        </div>
                      </td>

                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        {isSelf ? (
                          <span className="text-xs text-slate-400">Sua conta</span>
                        ) : (
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            {resettingUserId === u.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={resetPasswordValue}
                                  onChange={(e) => setResetPasswordValue(e.target.value)}
                                  placeholder="Nova senha"
                                  className="w-28 text-xs font-mono border border-slate-300 rounded px-2 py-1"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleSaveNewPassword(u)}
                                  className="px-2 py-1 text-[11px] font-semibold text-white bg-emerald-700 rounded"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setResettingUserId(null)}
                                  className="px-1.5 py-1 text-[11px] text-slate-600"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setResettingUserId(u.id);
                                  setResetPasswordValue(generateReadablePassword());
                                }}
                                title="Redefinir senha do cliente"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                              >
                                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Senha</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleActive(u)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                                u.active
                                  ? 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                  : 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {u.active ? 'Bloquear' : 'Reativar'}
                            </button>

                            {!isAdminRow &&
                              (confirmDeleteId === u.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void handleDeleteUser(u)}
                                    className="px-2 py-1 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-1.5 py-1 text-xs text-slate-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setConfirmDeleteId(u.id)}
                                  aria-label={`Excluir ${u.displayName}`}
                                  className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
