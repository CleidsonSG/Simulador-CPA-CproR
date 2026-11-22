import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cameFromInvite, supabase } from './supabase';

let inviteShown = false;

/** recovery: 'senha' = link de nova senha; 'convite' = primeiro acesso por convite (criar a senha). */
export type Recovery = false | 'senha' | 'convite';

/** Sessão do Supabase Auth. Sem Supabase configurado, fica sempre deslogado e pronto (modo demonstração). */
export function useSession(): { session: Session | null; ready: boolean; recovery: Recovery; endRecovery: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  // Veio pelo link de nova senha ou de convite: mostrar o formulário de senha.
  const [recovery, setRecovery] = useState<Recovery>(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery('senha');
      else if (event === 'SIGNED_IN' && cameFromInvite && !inviteShown) {
        inviteShown = true;
        setRecovery('convite');
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return { session, ready, recovery, endRecovery: () => setRecovery(false) };
}

/** Mensagens do Supabase Auth em português, sem expor detalhes técnicos. */
export function authMessage(raw: string | undefined): string {
  const m = (raw ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (m.includes('already registered')) return 'Este e-mail já tem conta. Use "Entrar".';
  if (m.includes('password should be') || m.includes('weak')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'E-mail inválido.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet.';
  return 'Não foi possível concluir. Tente de novo.';
}

export function validateCredentials(email: string, password: string, mode: 'entrar' | 'criar'): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Informe um e-mail válido.';
  if (mode === 'criar' && password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (password.length === 0) return 'Informe a senha.';
  return null;
}
