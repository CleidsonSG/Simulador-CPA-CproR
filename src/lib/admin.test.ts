import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminErrorMessage, displayName, fetchMyProfile, filterUsers, formatDate, isPendingInvite, type AdminUser } from './admin';

const u = (over: Partial<AdminUser>): AdminUser => ({
  user_id: 'x', email: 'a@b.co', full_name: null, status: 'aprovado', role: 'aluno', invited: false,
  created_at: '2026-11-16T12:00:00Z', decided_at: null, confirmed: true, last_sign_in_at: '2026-11-20T12:00:00Z', ...over,
});

describe('painel: listas e filtros', () => {
  const list = [
    u({ user_id: '1', email: 'ana@x.com', status: 'pendente' }),
    u({ user_id: '2', email: 'bruno@x.com', full_name: 'Bruno Lima' }),
    u({ user_id: '3', email: 'carla@x.com', status: 'bloqueado' }),
    u({ user_id: '4', email: 'convidado@x.com', invited: true, last_sign_in_at: null }),
  ];
  it('convite pendente = convidado que nunca entrou; fica fora da lista de usuários', () => {
    expect(list.filter(isPendingInvite).map((x) => x.user_id)).toEqual(['4']);
    expect(filterUsers(list, '', 'todas').map((x) => x.user_id)).toEqual(['1', '2', '3']);
  });
  it('filtra por situação e busca por nome ou e-mail (sem diferenciar maiúsculas)', () => {
    expect(filterUsers(list, '', 'pendente').map((x) => x.user_id)).toEqual(['1']);
    expect(filterUsers(list, 'LIMA', 'todas').map((x) => x.user_id)).toEqual(['2']);
    expect(filterUsers(list, 'carla@', 'aprovado')).toEqual([]);
  });
  it('nome de exibição: nome, senão o começo do e-mail', () => {
    expect(displayName({ full_name: ' Bruno ', email: 'b@x' })).toBe('Bruno');
    expect(displayName({ full_name: null, email: 'carla.s@x.com' })).toBe('carla.s');
    expect(displayName({ full_name: null, email: null })).toBe('Sem nome');
  });
  it('data no formato brasileiro', () => {
    expect(formatDate('2026-11-16T12:00:00Z')).toBe('16/11/2026');
    expect(formatDate(null)).toBe('—');
  });
});

describe('painel: mensagens de erro', () => {
  it('traduz erros conhecidos', () => {
    expect(adminErrorMessage(new Error('Apenas administrador'))).toMatch(/Só o administrador/);
    expect(adminErrorMessage(new Error('FUNCAO_INDISPONIVEL'))).toMatch(/admin-usuarios/);
    expect(adminErrorMessage({ message: 'Could not find the function public.admin_list_users' })).toMatch(/0007/);
    expect(adminErrorMessage(new Error('TypeError: Failed to fetch'))).toMatch(/internet/);
  });
  it('mantém a mensagem em português vinda do banco/função', () => {
    expect(adminErrorMessage(new Error('Este e-mail já tem conta.'))).toBe('Este e-mail já tem conta.');
    expect(adminErrorMessage(new Error('É preciso manter pelo menos um administrador'))).toMatch(/pelo menos um/);
  });
});

describe('perfil da conta logada', () => {
  const fake = (result: { data: unknown; error: { code?: string; message: string } | null }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as unknown as SupabaseClient;

  it('lê situação e papel', async () => {
    expect(await fetchMyProfile(fake({ data: { status: 'pendente', role: 'aluno' }, error: null }), 'u')).toEqual({ status: 'pendente', role: 'aluno' });
  });
  it('sem a migração 0007 (tabela não existe): segue como antes, aprovado', async () => {
    expect(await fetchMyProfile(fake({ data: null, error: { code: 'PGRST205', message: 'not found' } }), 'u')).toMatchObject({ status: 'aprovado', legacy: true });
  });
  it('sem linha de perfil: trata como pendente (o banco também bloqueia)', async () => {
    expect((await fetchMyProfile(fake({ data: null, error: null }), 'u')).status).toBe('pendente');
  });
  it('outros erros sobem para a tela tratar', async () => {
    await expect(fetchMyProfile(fake({ data: null, error: { code: '500', message: 'x' } }), 'u')).rejects.toBeTruthy();
  });
});
