import type { SupabaseClient } from '@supabase/supabase-js';

/* Painel de administração: chamadas ao banco (funções admin_*, que conferem is_admin) e à Edge Function
   admin-usuarios (convites). Funções puras no fim, testadas sem rede. */

export type UserStatus = 'pendente' | 'aprovado' | 'bloqueado';
export type UserRole = 'aluno' | 'admin';

export interface Profile {
  status: UserStatus;
  role: UserRole;
  /** true quando a tabela de perfis ainda não existe (migração 0007 não aplicada): segue o comportamento antigo. */
  legacy?: boolean;
}

export interface AdminUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  status: UserStatus;
  role: UserRole;
  invited: boolean;
  created_at: string;
  decided_at: string | null;
  confirmed: boolean;
  last_sign_in_at: string | null;
}

const MISSING_TABLE = ['42P01', 'PGRST205', 'PGRST202'];

/** Perfil da conta logada. Sem a migração 0007, devolve "aprovado/aluno" (como era antes). */
export async function fetchMyProfile(sb: SupabaseClient, userId: string): Promise<Profile> {
  const { data, error } = await sb.from('profiles').select('status,role').eq('user_id', userId).maybeSingle();
  if (error) {
    if (MISSING_TABLE.includes(error.code ?? '')) return { status: 'aprovado', role: 'aluno', legacy: true };
    throw error;
  }
  // Conta criada antes do gatilho existir e sem perfil: o banco trata como não aprovada.
  return data ? (data as Profile) : { status: 'pendente', role: 'aluno' };
}

export async function listUsers(sb: SupabaseClient): Promise<AdminUser[]> {
  const { data, error } = await sb.rpc('admin_list_users');
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

export async function setUser(sb: SupabaseClient, userId: string, change: { status?: UserStatus; role?: UserRole }): Promise<void> {
  const { error } = await sb.rpc('admin_set_user', { p_user: userId, p_status: change.status ?? null, p_role: change.role ?? null });
  if (error) throw error;
}

export async function getSignupAuto(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc('admin_get_signup_auto');
  if (error) throw error;
  return data === true;
}

export async function setSignupAuto(sb: SupabaseClient, auto: boolean): Promise<void> {
  const { error } = await sb.rpc('admin_set_signup_auto', { p_auto: auto });
  if (error) throw error;
}

async function callFunction(sb: SupabaseClient, body: Record<string, unknown>): Promise<void> {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body });
  if (error) {
    // Erro HTTP da função: a mensagem em português vem no corpo.
    const ctx = (error as { context?: Response }).context;
    let msg: string | undefined;
    try {
      msg = ctx ? ((await ctx.json()) as { error?: string }).error : undefined;
    } catch {
      /* corpo não é JSON */
    }
    throw new Error(msg ?? (error.name === 'FunctionsFetchError' ? 'FUNCAO_INDISPONIVEL' : error.message));
  }
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String((data as { error: unknown }).error));
}

export const inviteUser = (sb: SupabaseClient, email: string, role: UserRole, redirectTo: string) =>
  callFunction(sb, { acao: 'convidar', email: email.trim(), perfil: role, redirectTo });

export const cancelInvite = (sb: SupabaseClient, userId: string) => callFunction(sb, { acao: 'cancelar_convite', user_id: userId });

/** O próprio Supabase envia o link; o sistema nunca vê nem define senhas. */
export async function sendPasswordReset(sb: SupabaseClient, email: string, redirectTo: string): Promise<void> {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/* ───────────── Funções puras ───────────── */

export const STATUS_LABEL: Record<UserStatus, string> = { pendente: 'Pendente', aprovado: 'Aprovado', bloqueado: 'Bloqueado' };
export const STATUS_ICON: Record<UserStatus, string> = { pendente: '●', aprovado: '✓', bloqueado: '⛔' };
export const ROLE_LABEL: Record<UserRole, string> = { aluno: 'Aluno', admin: 'Administrador' };

/** Convidado que ainda não abriu o link (nunca entrou). */
export const isPendingInvite = (u: AdminUser) => u.invited && !u.last_sign_in_at;

export function filterUsers(users: readonly AdminUser[], query: string, status: UserStatus | 'todas'): AdminUser[] {
  const q = query.trim().toLowerCase();
  return users.filter(
    (u) =>
      !isPendingInvite(u) &&
      (status === 'todas' || u.status === status) &&
      (!q || (u.email ?? '').toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q)),
  );
}

export function displayName(u: Pick<AdminUser, 'full_name' | 'email'>): string {
  return u.full_name?.trim() || (u.email ? u.email.split('@')[0] : 'Sem nome');
}

/** Mensagens das funções do banco / da Edge Function em português, sem detalhes técnicos. */
export function adminErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  if (m === 'FUNCAO_INDISPONIVEL') return 'A função de convites ainda não foi publicada no Supabase (admin-usuarios).';
  if (/Apenas administrador/i.test(m)) return 'Só o administrador pode fazer isso.';
  if (/própria conta/i.test(m)) return 'Você não pode bloquear nem rebaixar a própria conta.';
  if (/pelo menos um administrador/i.test(m)) return 'É preciso manter pelo menos um administrador.';
  if (/admin_list_users|could not find the function|PGRST202/i.test(m)) return 'O banco ainda não tem o painel: rode a migração 0007 no SQL Editor.';
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/rate limit|too many/i.test(m)) return 'Muitos pedidos seguidos. Aguarde alguns minutos.';
  if (/[a-zà-ú]/i.test(m) && m.length < 140 && !/[{}_]/.test(m)) return m; // mensagem já em português vinda da função
  return 'Não foi possível concluir. Tente de novo.';
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}
