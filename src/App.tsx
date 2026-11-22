import { useCallback, useEffect, useState } from 'react';
import type { Answers, AttemptRecord, Cert, Mode, Question, Scenario } from './types';
import { EXAMS, buildExam, grade, minutesFor, passMark, pickQuestions } from './lib/exam';
import { applyResults, errorIds, type ErrorBook } from './lib/errors';
import { clearStudyData, loadClearedAt, loadErrors, loadHistory, loadLastExam, loadTheme, saveAttempt, saveErrors, saveHistory, saveLastExam, saveTheme } from './lib/storage';
import { loadQuestions } from './data/source';
import { supabase } from './lib/supabase';
import { useSession } from './lib/auth';
import { afterClear, buildAttempt, clearRemoteHistory, dropQueuedAttempts, enqueue, fetchRemoteHistory, flushOutbox, loadOutbox, mergeHistory, newId, originalIndex } from './lib/sync';
import { Account } from './components/Account';
import { NewPassword } from './components/NewPassword';
import { Admin } from './components/Admin';
import { fetchMyProfile, type Profile } from './lib/admin';
import { Home } from './components/Home';
import { Quiz, type MapPaths } from './components/Quiz';
import { Result } from './components/Result';
import { Progress } from './components/Progress';
import { Plan } from './components/Plan';
import { Train, type StartOpts } from './components/Train';

type Screen =
  | { name: 'home' }
  | { name: 'account' }
  | { name: 'admin' }
  | { name: 'progress'; cert: Cert }
  | { name: 'plan'; cert: Cert }
  | { name: 'train'; cert: Cert }
  | { name: 'loading' }
  | { name: 'error'; opts: StartOpts; message: string }
  | { name: 'quiz'; opts: StartOpts; questions: Question[]; scenarios: Record<string, Scenario>; minutes: number; isSample: boolean }
  | { name: 'result'; opts: StartOpts; questions: Question[]; scenarios: Record<string, Scenario>; paths: MapPaths; answers: Answers; usedSeconds: number; isSample: boolean };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [history, setHistory] = useState<AttemptRecord[]>(() => loadHistory());
  const [errors, setErrors] = useState<ErrorBook>(() => loadErrors());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadTheme());
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const lastCert: Cert = history[0]?.cert ?? 'CPA';

  // ── Conta e sincronização com o Supabase ──
  const { session, ready, recovery, endRecovery } = useSession();
  const userId = session?.user.id ?? null;
  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Perfil (migração 0007): só conta aprovada usa o banco real; admin vê o painel.
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    setProfile(null);
    if (!supabase || !userId) return;
    let alive = true;
    fetchMyProfile(supabase, userId)
      .then((p) => alive && setProfile(p))
      .catch(() => alive && setProfile({ status: 'pendente', role: 'aluno' }));
    return () => {
      alive = false;
    };
  }, [userId, online]);
  const approved = !!userId && profile?.status === 'aprovado';
  const isAdmin = approved && profile?.role === 'admin' && !profile.legacy;

  const sync = useCallback(async () => {
    if (!supabase || !userId || !approved) return;
    try {
      const r = await flushOutbox(supabase, userId);
      setPending(r.left);
      const merged = mergeHistory(loadHistory(), afterClear(await fetchRemoteHistory(supabase), loadClearedAt()));
      saveHistory(merged);
      setHistory(merged);
      setSyncMsg(null);
    } catch {
      setPending(loadOutbox().filter((i) => i.userId === userId).length);
      setSyncMsg('Não foi possível falar com o servidor agora. Tentaremos de novo quando houver internet.');
    }
  }, [userId, approved]);

  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  const start = useCallback(
    async (opts: StartOpts) => {
      setScreen({ name: 'loading' });
      try {
        const cfg = EXAMS[opts.cert];
        const bank = await loadQuestions(opts.cert, approved);
        const single = bank.questions.filter((q) => !q.scenarioCode);
        let questions: Question[];
        let minutes = 0;
        if (opts.mode === 'prova') {
          const last = loadLastExam(opts.cert);
          questions = buildExam(cfg, bank.questions, { recentIds: new Set(last), previousOrder: last, scenarios: bank.scenarios });
          saveLastExam(opts.cert, questions.map((q) => q.id));
          minutes = minutesFor(cfg, questions.length);
        } else if (opts.mode === 'treino') {
          // Questões de conjunto só fazem sentido com o mapa/caso: ficam fora do treino e da revisão de erros.
          questions = pickQuestions(single.filter((q) => q.topic === opts.topic), opts.count);
        } else {
          const ids = new Set(errorIds(errors, opts.cert));
          questions = pickQuestions(single.filter((q) => ids.has(q.id)), opts.count ?? 20);
        }
        if (questions.length === 0) {
          setScreen({
            name: 'error',
            opts,
            message:
              opts.mode === 'erros'
                ? `Você não tem erros para revisar em ${cfg.label}.`
                : 'Não há questões disponíveis para esta seleção.',
          });
          return;
        }
        const scenarios = Object.fromEntries(bank.scenarios.map((s) => [s.code, s]));
        setScreen({ name: 'quiz', opts, questions, scenarios, minutes, isSample: bank.isSample });
      } catch {
        setScreen({
          name: 'error',
          opts,
          message: navigator.onLine
            ? 'Falha ao carregar as questões. Tente de novo.'
            : 'Sem internet: não foi possível baixar as questões. Conecte-se e tente de novo.',
        });
      }
    },
    [errors, approved],
  );

  const finish = useCallback(
    (opts: StartOpts, questions: Question[], scenarios: Record<string, Scenario>, paths: MapPaths, answers: Answers, usedSeconds: number, isSample: boolean) => {
      const mode: Mode = opts.mode;
      const cfg = EXAMS[opts.cert];
      const g = grade(questions, answers);

      // Caderno de erros: vale para todos os modos (só múltipla escolha; conjuntos dependem do mapa/caso).
      const nextErrors = applyResults(
        errors,
        questions.filter((q) => !q.scenarioCode).map((q) => ({ id: q.id, cert: q.cert, correct: answers[q.id] === q.correctIndex })),
        mode,
        new Date().toISOString(),
      );
      setErrors(nextErrors);
      saveErrors(nextErrors);

      // Histórico e indicador de prontidão: só simulados completos.
      if (mode === 'prova') {
        const mark = passMark(cfg, questions.length);
        const id = newId();
        const now = new Date();
        // Banco real + login: grava em attempts/attempt_answers (via fila, para funcionar sem internet).
        if (!isSample && userId) {
          enqueue({ kind: 'attempt', userId, ...buildAttempt(id, opts.cert, questions, answers, g, mark, usedSeconds, now) });
          void sync();
        }
        setHistory(
          saveAttempt({
            id,
            cert: opts.cert,
            date: now.toISOString(),
            correct: g.correct,
            total: g.total,
            passMark: mark,
            passed: g.correct >= mark,
            usedSeconds,
            byTopic: g.byTopic,
          }),
        );
      }
      setScreen({ name: 'result', opts, questions, scenarios, paths, answers, usedSeconds, isSample });
    },
    [errors, userId, sync],
  );

  /** Recurso: sempre fica no navegador; com banco real e login, vai também para a tabela `appeals`. */
  const appeal = useCallback(
    (q: Question, category: string, argument: string, chosen: number | undefined, isSample: boolean) => {
      if (isSample || !userId) return;
      enqueue({ kind: 'appeal', userId, appeal: { question_id: q.id, cert: q.cert, category, argument: argument.trim(), chosen_index: originalIndex(q, chosen) } });
      void sync();
    },
    [userId, sync],
  );

  /** Limpar histórico: local sempre; no banco, os simulados da conta (migração 0008). */
  const clearHistory = useCallback(async (): Promise<string | null> => {
    clearStudyData();
    if (userId) dropQueuedAttempts(userId);
    setHistory([]);
    setErrors({});
    setPending(userId ? loadOutbox().filter((i) => i.userId === userId).length : 0);
    if (!supabase || !userId || !approved) return null;
    try {
      await clearRemoteHistory(supabase);
      return null;
    } catch {
      return navigator.onLine
        ? 'Limpamos neste aparelho. No servidor ainda não foi possível (o administrador precisa aplicar a atualização 0008); os simulados antigos não voltam a aparecer aqui.'
        : 'Limpamos neste aparelho. Sem internet, o servidor fica para depois; os simulados antigos não voltam a aparecer aqui.';
    }
  }, [userId, approved]);

  const home = () => setScreen({ name: 'home' });

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={home} aria-label="Voltar ao início">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Simulador Anbima</span>
        </button>
        <div className="topbar-actions">
          {isAdmin && (
            <button
              className={screen.name === 'admin' ? 'btn btn-primary account-btn' : 'btn btn-ghost account-btn'}
              onClick={() => setScreen({ name: 'admin' })}
              aria-label="Painel de administração"
            >
              <span aria-hidden="true">⚙</span>
              <span className="account-label">Admin</span>
            </button>
          )}
          {supabase && ready && (
            <button
              className={userId ? 'btn btn-ghost account-btn' : 'btn btn-primary account-btn'}
              onClick={() => setScreen({ name: 'account' })}
              aria-label={userId ? `Sua conta (${session?.user.email ?? ''})` : 'Entrar na sua conta'}
            >
              {userId ? (
                <>
                  <span className="avatar" aria-hidden="true">{(session?.user.email ?? '?')[0].toUpperCase()}</span>
                  <span className="account-label">Conta</span>
                  {pending > 0 && <span className="dot-pending" aria-label={`${pending} envios pendentes`} />}
                </>
              ) : (
                'Entrar'
              )}
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {!online && (
        <div className="banner banner-warn" role="status">
          Você está sem internet. O simulador continua funcionando com as questões já carregadas.
        </div>
      )}

      <main className="main">
        {recovery && <NewPassword onDone={endRecovery} invite={recovery === 'convite'} />}

        {screen.name === 'home' && supabase && ready && !userId && (
          <div className="banner banner-info" role="note">
            Você está usando questões de exemplo.{' '}
            <button className="link-btn" onClick={() => setScreen({ name: 'account' })}>Entre na sua conta</button> para usar o banco real.
          </div>
        )}

        {screen.name === 'home' && userId && profile?.status === 'pendente' && (
          <div className="banner banner-warn plan-warn" role="status">
            <b>Sua conta aguarda aprovação do administrador.</b> Enquanto isso, você pode treinar com as questões de exemplo.
          </div>
        )}
        {screen.name === 'home' && userId && profile?.status === 'bloqueado' && (
          <div className="banner banner-warn plan-warn" role="alert">
            <b>Seu acesso ao banco de questões está bloqueado.</b> Fale com o administrador. As questões de exemplo continuam disponíveis.
          </div>
        )}

        {screen.name === 'account' && (
          <Account session={session} profile={profile} pending={pending} syncMsg={syncMsg} onSync={() => void sync()} onBack={home} />
        )}

        {screen.name === 'admin' && supabase && userId && (
          isAdmin ? (
            <Admin sb={supabase} myId={userId} onBack={home} />
          ) : (
            <div className="card empty" role="alert">
              <p>Só o administrador acessa esta área.</p>
              <button className="btn" onClick={home}>Voltar</button>
            </div>
          )
        )}

        {screen.name === 'home' && (
          <Home
            history={history}
            onStart={(cert) => start({ cert, mode: 'prova' })}
            onProgress={() => setScreen({ name: 'progress', cert: lastCert })}
            onPlan={() => setScreen({ name: 'plan', cert: lastCert })}
            onTrain={() => setScreen({ name: 'train', cert: lastCert })}
            onClearHistory={clearHistory}
            errorCount={Object.keys(errors).length}
            signedIn={approved}
          />
        )}

        {screen.name === 'progress' && (
          <Progress
            history={history}
            initialCert={screen.cert}
            onPlan={(cert) => setScreen({ name: 'plan', cert })}
            onTrain={(cert, topic) => start({ cert, mode: 'treino', topic, count: 10 })}
            onBack={home}
          />
        )}

        {screen.name === 'plan' && (
          <Plan
            cert={screen.cert}
            history={history}
            onCert={(cert) => setScreen({ name: 'plan', cert })}
            onBack={() => setScreen({ name: 'progress', cert: screen.cert })}
          />
        )}

        {screen.name === 'train' && (
          <Train
            cert={screen.cert}
            history={history}
            errors={errors}
            onCert={(cert) => setScreen({ name: 'train', cert })}
            onStart={start}
            onBack={home}
          />
        )}

        {screen.name === 'loading' && (
          <div className="card skeleton-card" aria-busy="true" aria-label="Carregando questões">
            <div className="sk sk-title" />
            <div className="sk sk-line" />
            <div className="sk sk-line" />
            <div className="sk sk-opt" />
            <div className="sk sk-opt" />
            <div className="sk sk-opt" />
          </div>
        )}

        {screen.name === 'error' && (
          <div className="card empty" role="alert">
            <h2>Não foi possível montar a sessão</h2>
            <p>{screen.message}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {screen.opts.mode !== 'erros' && (
                <button className="btn btn-primary" onClick={() => start(screen.opts)}>Tentar de novo</button>
              )}
              <button className="btn" onClick={() => setScreen({ name: 'train', cert: screen.opts.cert })}>Voltar</button>
            </div>
          </div>
        )}

        {screen.name === 'quiz' && (
          <Quiz
            cfg={EXAMS[screen.opts.cert]}
            questions={screen.questions}
            scenarios={screen.scenarios}
            mode={screen.opts.mode}
            topic={screen.opts.topic}
            minutes={screen.minutes}
            isSample={screen.isSample}
            onAppeal={(q, cat, text, chosen) => appeal(q, cat, text, chosen, screen.isSample)}
            onFinish={(answers, used, paths) => finish(screen.opts, screen.questions, screen.scenarios, paths, answers, used, screen.isSample)}
            onExit={home}
          />
        )}

        {screen.name === 'result' && (
          <Result
            cfg={EXAMS[screen.opts.cert]}
            questions={screen.questions}
            scenarios={screen.scenarios}
            paths={screen.paths}
            answers={screen.answers}
            usedSeconds={screen.usedSeconds}
            isSample={screen.isSample}
            size={screen.questions.length}
            mode={screen.opts.mode}
            topic={screen.opts.topic}
            onTrain={(topic) => start({ cert: screen.opts.cert, mode: 'treino', topic, count: 10 })}
            onRetry={() =>
              screen.opts.mode === 'erros' && errorIds(errors, screen.opts.cert).length === 0
                ? setScreen({ name: 'train', cert: screen.opts.cert })
                : start(screen.opts)
            }
            onHome={home}
            onPlan={() => setScreen({ name: 'plan', cert: screen.opts.cert })}
            onProgress={() => setScreen({ name: 'progress', cert: screen.opts.cert })}
          />
        )}
      </main>
    </div>
  );
}
