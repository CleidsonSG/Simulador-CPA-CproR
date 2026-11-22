import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Chegou pelo link de convite? O Supabase põe `type=invite` no endereço e o cliente o apaga ao ler a sessão,
 * então é lido aqui, ANTES de criar o cliente. Quem chega por convite precisa criar a senha.
 */
export const cameFromInvite =
  typeof window !== 'undefined' && /(^|[#&?])type=invite(&|$)/.test(window.location.hash + window.location.search);

/**
 * Cliente do Supabase. Só usa a URL e a chave PÚBLICA (anon/publishable) — nunca a chave de serviço.
 * Sem `.env` (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY), fica null e o app roda com as questões de exemplo.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const remoteConfigured = supabase !== null;

/** Prefixo das imagens permitidas no texto dos casos: só o Storage público do próprio projeto. */
export const storageImagePrefix = url ? `${url.replace(/\/$/, '')}/storage/v1/object/public/` : null;
