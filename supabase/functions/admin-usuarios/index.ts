// Edge Function "admin-usuarios" — operações do painel que exigem a chave de serviço.
// Ações: { acao: 'convidar', email, perfil: 'aluno'|'admin', redirectTo }  e  { acao: 'cancelar_convite', user_id }.
// Segurança: só atende quem é admin. A checagem usa o token de quem chamou (rpc is_admin com RLS),
// e só depois cria o cliente com a chave de serviço (variável de ambiente do próprio Supabase, nunca no app).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Para onde o link do convite pode levar: o app publicado ou o ambiente local.
const REDIRECT_OK = /^(https:\/\/[a-z0-9.-]+(:\d+)?|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)(\/[^\s"'<>]*)?$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Função sem configuração do Supabase' }, 500);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Faça login novamente' }, 401);

  // 1) Quem chamou é admin? (com o token dele; o banco decide)
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: isAdmin, error: adminErr } = await asCaller.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ error: 'Apenas administrador' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Pedido inválido' }, 400);
  }
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.acao === 'convidar') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const perfil = body.perfil === 'admin' ? 'admin' : 'aluno';
    const redirectTo = typeof body.redirectTo === 'string' && REDIRECT_OK.test(body.redirectTo) ? body.redirectTo : undefined;
    if (!EMAIL.test(email)) return json({ error: 'E-mail inválido' }, 400);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { convite_perfil: perfil } });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('already') && m.includes('registered')) return json({ error: 'Este e-mail já tem conta.' }, 409);
      if (m.includes('rate limit')) return json({ error: 'Limite de e-mails atingido. Tente mais tarde.' }, 429);
      return json({ error: 'Não foi possível enviar o convite.' }, 502);
    }
    return json({ ok: true, user_id: data.user?.id });
  }

  if (body.acao === 'cancelar_convite') {
    const id = String(body.user_id ?? '');
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data.user) return json({ error: 'Convite não encontrado' }, 404);
    // Só apaga quem foi convidado e nunca entrou: nunca uma conta em uso.
    if (!data.user.invited_at || data.user.last_sign_in_at) return json({ error: 'Esta conta já está em uso; bloqueie em vez de cancelar.' }, 409);
    const del = await admin.auth.admin.deleteUser(id);
    if (del.error) return json({ error: 'Não foi possível cancelar o convite.' }, 502);
    return json({ ok: true });
  }

  return json({ error: 'Ação desconhecida' }, 400);
});
