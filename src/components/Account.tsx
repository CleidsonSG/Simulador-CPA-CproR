import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { authMessage, validateCredentials } from '../lib/auth';
import { STATUS_ICON, STATUS_LABEL, ROLE_LABEL, type Profile } from '../lib/admin';

interface Props {
  session: Session | null;
  profile: Profile | null;
  pending: number;
  syncMsg: string | null;
  onSync: () => void;
  onBack: () => void;
}

type Mode = 'entrar' | 'criar' | 'esqueci';

export function Account({ session, profile, pending, syncMsg, onSync, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  if (!supabase) {
    return (
      <div className="stack">
        <section className="card">
          <h1>Conta</h1>
          <p>O banco de questões ainda não está ligado neste ambiente. Você está no <b>modo demonstração</b>, com questões de exemplo.</p>
          <p className="muted small">Seu histórico e o caderno de erros ficam salvos neste navegador.</p>
          <button className="btn" onClick={onBack}>Voltar</button>
        </section>
      </div>
    );
  }

  if (session) {
    return (
      <div className="stack">
        <section className="card account">
          <h1>Sua conta</h1>
          <p>
            Conectado como <b>{session.user.email}</b>.
          </p>
          {profile && !profile.legacy && (
            <p>
              <span className={`tag st-${profile.status}`}>{STATUS_ICON[profile.status]} {STATUS_LABEL[profile.status]}</span>{' '}
              <span className="tag tag-soft">{ROLE_LABEL[profile.role]}</span>
            </p>
          )}
          <p className="muted small">
            {!profile
              ? 'Carregando sua conta…'
              : profile.status === 'aprovado'
              ? 'Os simulados usam o banco real de questões e ficam salvos na sua conta.'
              : profile.status === 'bloqueado'
                ? 'Seu acesso ao banco de questões está bloqueado. Fale com o administrador.'
                : 'Sua conta aguarda aprovação do administrador. Enquanto isso, use as questões de exemplo.'}
          </p>
          {pending > 0 ? (
            <div className="banner banner-warn plan-warn" role="status">
              {pending} envio(s) aguardando internet.{' '}
              <button className="btn btn-ghost small" onClick={onSync}>Enviar agora</button>
            </div>
          ) : (
            <p className="small">✓ Tudo sincronizado.</p>
          )}
          {syncMsg && <p className="small" role="status">{syncMsg}</p>}
          <div className="row">
            <button className="btn" onClick={onBack}>Voltar</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await supabase!.auth.signOut();
                onBack();
              }}
            >
              Sair da conta
            </button>
          </div>
        </section>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (mode === 'esqueci') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg({ kind: 'bad', text: 'Informe um e-mail válido.' });
      setBusy(true);
      const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      setBusy(false);
      return setMsg(error ? { kind: 'bad', text: authMessage(error.message) } : { kind: 'ok', text: 'Se o e-mail tiver conta, enviamos um link para criar nova senha.' });
    }
    const invalid = validateCredentials(email, password, mode);
    if (invalid) return setMsg({ kind: 'bad', text: invalid });
    setBusy(true);
    const { data, error } =
      mode === 'entrar'
        ? await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    setBusy(false);
    if (error) return setMsg({ kind: 'bad', text: authMessage(error.message) });
    if (mode === 'criar' && !data.session) setMsg({ kind: 'ok', text: 'Conta criada. Abra o link que enviamos para o seu e-mail e depois entre.' });
    else onBack();
  };

  return (
    <div className="stack">
      <section className="card account">
        <h1>{mode === 'criar' ? 'Criar conta' : mode === 'esqueci' ? 'Recuperar senha' : 'Entrar'}</h1>
        <p className="muted small">Com a conta você faz o simulado com o banco real de questões e guarda seu histórico em qualquer aparelho.</p>
        {mode !== 'esqueci' && (
          <div className="tabs" role="tablist" aria-label="Entrar ou criar conta">
            <button role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'tab tab-on' : 'tab'} onClick={() => setMode('entrar')}>
              Entrar
            </button>
            <button role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'tab tab-on' : 'tab'} onClick={() => setMode('criar')}>
              Criar conta
            </button>
          </div>
        )}
        <form className="auth-form" onSubmit={submit} noValidate>
          <label>
            E-mail
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== 'esqueci' && (
            <label>
              Senha {mode === 'criar' && <span className="muted small">(mínimo 8 caracteres)</span>}
              <input
                type="password"
                autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          )}
          {msg && (
            <p className={msg.kind === 'ok' ? 'feedback feedback-ok small' : 'feedback feedback-bad small'} role={msg.kind === 'ok' ? 'status' : 'alert'}>
              {msg.kind === 'ok' ? '✓ ' : '⚠ '}
              {msg.text}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
            {busy ? 'Aguarde…' : mode === 'criar' ? 'Criar conta' : mode === 'esqueci' ? 'Enviar link' : 'Entrar'}
          </button>
        </form>
        <div className="row">
          {mode === 'esqueci' ? (
            <button className="btn btn-ghost small" onClick={() => setMode('entrar')}>← Voltar para entrar</button>
          ) : (
            <button className="btn btn-ghost small" onClick={() => setMode('esqueci')}>Esqueci a senha</button>
          )}
          <button className="btn btn-ghost small" onClick={onBack}>Continuar sem conta (exemplos)</button>
        </div>
      </section>
    </div>
  );
}
