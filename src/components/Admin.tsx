import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ROLE_LABEL, STATUS_ICON, STATUS_LABEL, adminErrorMessage, cancelInvite, displayName, filterUsers, formatDate,
  getSignupAuto, inviteUser, isPendingInvite, listUsers, sendPasswordReset, setSignupAuto, setUser,
  type AdminUser, type UserRole, type UserStatus,
} from '../lib/admin';

interface Props {
  sb: SupabaseClient;
  myId: string;
  onBack: () => void;
}

type Tab = 'usuarios' | 'convites' | 'senha' | 'cadastro';
type Msg = { kind: 'ok' | 'bad'; text: string } | null;

const appUrl = () => window.location.origin + window.location.pathname;

function StatusTag({ status }: { status: UserStatus }) {
  return (
    <span className={`tag st-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {STATUS_LABEL[status]}
    </span>
  );
}

/** Botão que pede um segundo clique para confirmar (ações que tiram acesso). */
function ConfirmButton({ label, confirmLabel, className, onConfirm, disabled }: {
  label: string; confirmLabel: string; className: string; onConfirm: () => void; disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={armed ? 'btn btn-danger small-btn' : className}
      disabled={disabled}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Admin({ sb, myId, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('usuarios');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<UserStatus | 'todas'>('todas');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<UserRole>('aluno');
  const [auto, setAuto] = useState<boolean | null>(null);
  const [sentReset, setSentReset] = useState<Record<string, boolean>>({});
  const msgRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const [list, a] = await Promise.all([listUsers(sb), getSignupAuto(sb)]);
      setUsers(list);
      setAuto(a);
    } catch (e) {
      setLoadErr(adminErrorMessage(e));
    }
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const say = (m: Msg) => {
    setMsg(m);
    window.setTimeout(() => msgRef.current?.focus(), 30);
  };

  const run = async (key: string, fn: () => Promise<void>, ok: string): Promise<boolean> => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      say({ kind: 'ok', text: ok });
      await load();
      return true;
    } catch (e) {
      say({ kind: 'bad', text: adminErrorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => filterUsers(users ?? [], query, status), [users, query, status]);
  const invites = useMemo(() => (users ?? []).filter(isPendingInvite), [users]);
  const resetList = useMemo(() => filterUsers(users ?? [], query, 'todas').filter((u) => u.email), [users, query]);
  const pendingCount = (users ?? []).filter((u) => u.status === 'pendente' && !isPendingInvite(u)).length;

  const invite = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invEmail.trim())) return say({ kind: 'bad', text: 'Informe um e-mail válido.' });
    void run('convite', () => inviteUser(sb, invEmail, invRole, appUrl()), `Convite enviado para ${invEmail.trim()}.`).then((ok) => {
      if (!ok) return;
      setInvEmail('');
      setInviteOpen(false);
      setTab('convites');
    });
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'usuarios', label: 'Usuários', badge: pendingCount || undefined },
    { id: 'convites', label: 'Convites pendentes', badge: invites.length || undefined },
    { id: 'senha', label: 'Reset de senha' },
    { id: 'cadastro', label: 'Cadastro' },
  ];

  return (
    <div className="stack admin">
      <div className="admin-head">
        <div>
          <h1>Administração</h1>
          <p className="muted">Aprove pedidos, defina perfis, convide pessoas e envie links de nova senha.</p>
        </div>
        <div className="row admin-actions">
          <button className="btn" onClick={() => void load()} disabled={busy !== null}>↻ Atualizar</button>
          <button className="btn btn-primary" onClick={() => setInviteOpen(!inviteOpen)} aria-expanded={inviteOpen}>
            + Convidar usuário
          </button>
        </div>
      </div>

      {inviteOpen && (
        <form className="card invite-form" onSubmit={invite} noValidate>
          <h2>Convidar usuário</h2>
          <p className="muted small">A pessoa recebe um e-mail, cria a senha e entra já aprovada, com o perfil escolhido.</p>
          <div className="invite-grid">
            <label>
              E-mail
              <input type="email" autoComplete="off" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
            </label>
            <label>
              Perfil
              <select value={invRole} onChange={(e) => setInvRole(e.target.value as UserRole)}>
                <option value="aluno">Aluno</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={busy === 'convite'}>{busy === 'convite' ? 'Enviando…' : 'Enviar convite'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setInviteOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {msg && (
        <p ref={msgRef} tabIndex={-1} className={msg.kind === 'ok' ? 'feedback feedback-ok' : 'feedback feedback-bad'} role={msg.kind === 'ok' ? 'status' : 'alert'}>
          {msg.kind === 'ok' ? '✓ ' : '⚠ '}
          {msg.text}
        </p>
      )}

      <div className="admin-tabs" role="tablist" aria-label="Seções da administração">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'admin-tab on' : 'admin-tab'} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge !== undefined && <span className="count" aria-label={`${t.badge} pendente(s)`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {loadErr ? (
        <div className="card empty" role="alert">
          <p>{loadErr}</p>
          <button className="btn btn-primary" onClick={() => void load()}>Tentar de novo</button>
        </div>
      ) : users === null ? (
        <div className="card skeleton-card" aria-busy="true" aria-label="Carregando usuários">
          <div className="sk sk-line" />
          <div className="sk sk-opt" />
          <div className="sk sk-opt" />
        </div>
      ) : (
        <>
          {tab === 'usuarios' && (
            <section className="card" aria-label="Usuários">
              <div className="admin-filters">
                <label>
                  Buscar
                  <input type="search" placeholder="Nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label>
                  Situação
                  <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus | 'todas')}>
                    <option value="todas">Todas</option>
                    <option value="pendente">Pendentes</option>
                    <option value="aprovado">Aprovados</option>
                    <option value="bloqueado">Bloqueados</option>
                  </select>
                </label>
              </div>
              {shown.length === 0 ? (
                <div className="empty-inline">Nenhum usuário encontrado.</div>
              ) : (
                <ul className="user-list">
                  <li className="user-row user-head" aria-hidden="true">
                    <span>Nome</span><span>Situação</span><span>Perfil</span><span>Cadastro</span><span>Ações</span>
                  </li>
                  {shown.map((u) => {
                    const me = u.user_id === myId;
                    const key = u.user_id;
                    return (
                      <li key={key} className="user-row">
                        <div className="user-id">
                          <strong>{displayName(u)}</strong> {me && <span className="muted small">(você)</span>}
                          <span className="muted small user-email">{u.email}</span>
                          {!u.confirmed && <span className="muted small">E-mail ainda não confirmado</span>}
                        </div>
                        <div><span className="cell-label">Situação</span><StatusTag status={u.status} /></div>
                        <label className="cell-role">
                          <span className="cell-label">Perfil</span>
                          <select
                            aria-label={`Perfil de ${u.email ?? displayName(u)}`}
                            value={u.role}
                            disabled={me || busy !== null}
                            onChange={(e) => void run(key, () => setUser(sb, key, { role: e.target.value as UserRole }), `Perfil de ${u.email} alterado para ${ROLE_LABEL[e.target.value as UserRole]}.`)}
                          >
                            <option value="aluno">Aluno</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </label>
                        <div><span className="cell-label">Cadastro</span>{formatDate(u.created_at)}</div>
                        <div className="user-actions">
                          {me ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              {u.status !== 'aprovado' && (
                                <button className="btn btn-primary small-btn" disabled={busy !== null} onClick={() => void run(key, () => setUser(sb, key, { status: 'aprovado' }), `${u.email} aprovado.`)}>
                                  {u.status === 'bloqueado' ? 'Desbloquear' : '✓ Aprovar'}
                                </button>
                              )}
                              {u.status !== 'bloqueado' && (
                                <ConfirmButton
                                  label={u.status === 'pendente' ? 'Recusar' : '⛔ Bloquear'}
                                  confirmLabel="Confirmar bloqueio"
                                  className="btn btn-ghost small-btn danger-text"
                                  disabled={busy !== null}
                                  onConfirm={() => void run(key, () => setUser(sb, key, { status: 'bloqueado' }), `${u.email} bloqueado.`)}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === 'convites' && (
            <section className="card" aria-label="Convites pendentes">
              <p className="muted small">O convite chega por e-mail. Ao abrir o link e criar a senha, a pessoa entra já aprovada, com o perfil escolhido.</p>
              {invites.length === 0 ? (
                <div className="empty-inline">Nenhum convite aguardando resposta.</div>
              ) : (
                <ul className="train-list">
                  {invites.map((u) => (
                    <li key={u.user_id}>
                      <div className="train-info">
                        <strong>{u.email}</strong>
                        <span className="muted small">{ROLE_LABEL[u.role]} · enviado em {formatDate(u.created_at)}</span>
                      </div>
                      <ConfirmButton
                        label="Cancelar convite"
                        confirmLabel="Confirmar"
                        className="btn btn-ghost small-btn danger-text"
                        disabled={busy !== null}
                        onConfirm={() => void run(u.user_id, () => cancelInvite(sb, u.user_id), `Convite para ${u.email} cancelado.`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'senha' && (
            <section className="card" aria-label="Reset de senha">
              <p className="muted small">O sistema não vê nem define senhas. O Supabase envia à pessoa um link para ela mesma criar uma senha nova.</p>
              <div className="admin-filters single">
                <label>
                  Buscar
                  <input type="search" placeholder="Nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
              </div>
              {resetList.length === 0 ? (
                <div className="empty-inline">Nenhum usuário encontrado.</div>
              ) : (
                <ul className="train-list">
                  {resetList.map((u) => (
                    <li key={u.user_id}>
                      <div className="train-info">
                        <strong>{displayName(u)}</strong>
                        <span className="muted small">{u.email}</span>
                      </div>
                      <button
                        className="btn small-btn"
                        disabled={busy !== null || sentReset[u.user_id]}
                        onClick={() =>
                          void run(u.user_id, async () => {
                            await sendPasswordReset(sb, u.email!, appUrl());
                            setSentReset((s) => ({ ...s, [u.user_id]: true }));
                          }, `Link de nova senha enviado para ${u.email}.`)
                        }
                      >
                        {sentReset[u.user_id] ? '✓ Link enviado' : '🔑 Enviar link de nova senha'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'cadastro' && (
            <section className="card" aria-label="Cadastro de novas contas">
              <h2>Novas contas</h2>
              <fieldset className="radio-list" disabled={busy !== null || auto === null}>
                <legend className="sr-only">Como tratar quem cria conta pelo site</legend>
                <label className={auto === false ? 'radio-card on' : 'radio-card'}>
                  <input type="radio" name="auto" checked={auto === false} onChange={() => void run('auto', () => setSignupAuto(sb, false), 'Novas contas ficarão pendentes até você aprovar.')} />
                  <span>
                    <strong>Ficam pendentes até eu aprovar</strong> <span className="tag tag-soft">Recomendado</span>
                    <span className="muted small">A pessoa entra, mas só vê as questões de exemplo até você aprovar em Usuários.</span>
                  </span>
                </label>
                <label className={auto === true ? 'radio-card on' : 'radio-card'}>
                  <input type="radio" name="auto" checked={auto === true} onChange={() => void run('auto', () => setSignupAuto(sb, true), 'Novas contas já entram aprovadas.')} />
                  <span>
                    <strong>Já entram aprovadas</strong>
                    <span className="muted small">Qualquer pessoa que criar conta usa o banco real na hora. Você ainda pode bloquear.</span>
                  </span>
                </label>
              </fieldset>
              <p className="muted small">
                Para impedir qualquer cadastro novo (só por convite), desligue “Allow new users to sign up” em Supabase → Authentication → Sign In / Providers.
              </p>
            </section>
          )}
        </>
      )}

      <div>
        <button className="btn" onClick={onBack}>Voltar</button>
      </div>
    </div>
  );
}
