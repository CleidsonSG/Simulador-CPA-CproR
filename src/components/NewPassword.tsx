import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { authMessage } from '../lib/auth';

/** Aberto pelo link de recuperação de senha enviado por e-mail. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setMsg('A senha precisa ter pelo menos 8 caracteres.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg(authMessage(error.message));
    onDone();
  };

  return (
    <section className="card account">
      <h1>Nova senha</h1>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label>
          Nova senha <span className="muted small">(mínimo 8 caracteres)</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && <p className="feedback feedback-bad small" role="alert">⚠ {msg}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Aguarde…' : 'Salvar nova senha'}</button>
      </form>
    </section>
  );
}
