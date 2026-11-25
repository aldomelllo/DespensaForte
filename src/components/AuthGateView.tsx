import { useState } from 'react';
import {
  Database,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { AuthUser } from '../types/auth';
import { bootstrapAdminAccount, loginWithPassword } from '../services/api';

interface AuthGateViewProps {
  storageConfigured: boolean;
  needsBootstrap: boolean;
  storageError?: string;
  onAuthenticated: (user: AuthUser) => void;
  onRetryStatus: () => void;
}

export function AuthGateView({
  storageConfigured,
  needsBootstrap,
  storageError,
  onAuthenticated,
  onRetryStatus,
}: AuthGateViewProps) {
  const [username, setUsername] = useState(needsBootstrap ? 'admin' : '');
  const [displayName, setDisplayName] = useState(needsBootstrap ? 'Administrador' : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!storageConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                DespensaForte · Falta conectar o Banco na Nuvem
              </h1>
              <p className="text-xs text-slate-500">
                Configuração única e gratuita na Vercel (leva 1 minuto)
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            {storageError ||
              'Para que os logins de ADM e clientes funcionem em qualquer celular com isolamento total de dados, conecte o banco Upstash Redis gratuito na Vercel:'}
          </p>

          <ol className="text-xs text-slate-700 space-y-2 list-decimal list-inside bg-slate-50 border border-slate-200 rounded-xl p-4">
            <li>
              Abra seu projeto na <strong>Vercel</strong> e clique na aba <strong>Storage</strong>.
            </li>
            <li>
              Clique em <strong>Create Database</strong> → escolha <strong>Upstash Redis</strong> (plano gratuito) e conecte ao projeto <strong>despensa-forte</strong>.
            </li>
            <li>
              Na aba <strong>Deployments</strong>, clique nos 3 pontinhos do último deploy → <strong>Redeploy</strong>.
            </li>
          </ol>

          <button
            type="button"
            onClick={onRetryStatus}
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
          >
            Já conectei — Verificar novamente
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim()) {
      setErrorMsg('Informe o usuário (ou e-mail).');
      return;
    }
    if (!password) {
      setErrorMsg('Informe a senha.');
      return;
    }

    if (needsBootstrap) {
      if (!displayName.trim()) {
        setErrorMsg('Informe o nome do administrador.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('A senha do administrador deve ter no mínimo 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('As senhas digitadas não conferem.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const user = needsBootstrap
        ? await bootstrapAdminAccount({
            username: username.trim(),
            displayName: displayName.trim(),
            password,
          })
        : await loginWithPassword(username.trim(), password);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha na autenticação.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center mx-auto">
            {needsBootstrap ? (
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Lock className="w-6 h-6" aria-hidden="true" />
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            DespensaForte
          </h1>
          <p className="text-xs text-slate-600">
            {needsBootstrap
              ? 'Primeiro acesso: crie a conta do Administrador (ADM). Depois você poderá criar os logins dos seus clientes.'
              : 'Controle de Gastos de Feira e Estocagem · Área de Clientes'}
          </p>
        </div>

        {errorMsg && (
          <div role="alert" className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-800">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsBootstrap && (
            <div>
              <label htmlFor="auth-display-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nome do Administrador
              </label>
              <input
                id="auth-display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Aldo Mello"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-username" className="block text-xs font-medium text-slate-700 mb-1">
              Usuário ou E-mail
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={needsBootstrap ? 'admin' : 'Digite seu usuário'}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1">
              Senha
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-sm border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {needsBootstrap && (
            <div>
              <label htmlFor="auth-confirm-password" className="block text-xs font-medium text-slate-700 mb-1">
                Confirmar Senha
              </label>
              <input
                id="auth-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserCheck className="w-4 h-4" aria-hidden="true" />
            )}
            <span>
              {isSubmitting
                ? 'Validando...'
                : needsBootstrap
                  ? 'Criar Conta ADM e Entrar'
                  : 'Entrar na Minha Despensa'}
            </span>
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-[11px] text-slate-500">
          {needsBootstrap
            ? 'Esta configuração só aparece uma única vez enquanto não existir nenhum usuário.'
            : 'Acesso exclusivo para assinantes. Seus dados são privados e isolados na sua conta.'}
        </div>
      </div>
    </div>
  );
}
