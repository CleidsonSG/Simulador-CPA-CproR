import { useCallback, useEffect, useState } from 'react';
import type { Answers, AttemptRecord, Cert, Mode, Question } from './types';
import { EXAMS, buildExam, grade, minutesFor, passMark, pickQuestions } from './lib/exam';
import { applyResults, errorIds, type ErrorBook } from './lib/errors';
import { loadErrors, loadHistory, loadTheme, saveAttempt, saveErrors, saveTheme } from './lib/storage';
import { loadQuestions } from './data/source';
import { Home } from './components/Home';
import { Quiz } from './components/Quiz';
import { Result } from './components/Result';
import { Progress } from './components/Progress';
import { Plan } from './components/Plan';
import { Train, type StartOpts } from './components/Train';

type Screen =
  | { name: 'home' }
  | { name: 'progress'; cert: Cert }
  | { name: 'plan'; cert: Cert }
  | { name: 'train'; cert: Cert }
  | { name: 'loading' }
  | { name: 'error'; opts: StartOpts; message: string }
  | { name: 'quiz'; opts: StartOpts; questions: Question[]; minutes: number; isSample: boolean }
  | { name: 'result'; opts: StartOpts; questions: Question[]; answers: Answers; usedSeconds: number; isSample: boolean };

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

  const start = useCallback(
    async (opts: StartOpts) => {
      setScreen({ name: 'loading' });
      try {
        const cfg = EXAMS[opts.cert];
        const bank = await loadQuestions(opts.cert);
        let questions: Question[];
        let minutes = 0;
        if (opts.mode === 'prova') {
          questions = buildExam(cfg, bank.questions);
          minutes = minutesFor(cfg, questions.length);
        } else if (opts.mode === 'treino') {
          questions = pickQuestions(bank.questions.filter((q) => q.topic === opts.topic), opts.count);
        } else {
          const ids = new Set(errorIds(errors, opts.cert));
          questions = pickQuestions(bank.questions.filter((q) => ids.has(q.id)), opts.count ?? 20);
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
        setScreen({ name: 'quiz', opts, questions, minutes, isSample: bank.isSample });
      } catch {
        setScreen({ name: 'error', opts, message: 'Falha ao carregar as questões. Tente de novo.' });
      }
    },
    [errors],
  );

  const finish = useCallback(
    (opts: StartOpts, questions: Question[], answers: Answers, usedSeconds: number, isSample: boolean) => {
      const mode: Mode = opts.mode;
      const cfg = EXAMS[opts.cert];
      const g = grade(questions, answers);

      // Caderno de erros: vale para todos os modos.
      const nextErrors = applyResults(
        errors,
        questions.map((q) => ({ id: q.id, cert: q.cert, correct: answers[q.id] === q.correctIndex })),
        mode,
        new Date().toISOString(),
      );
      setErrors(nextErrors);
      saveErrors(nextErrors);

      // Histórico e indicador de prontidão: só simulados completos.
      if (mode === 'prova') {
        const mark = passMark(cfg, questions.length);
        setHistory(
          saveAttempt({
            id: `${Date.now()}`,
            cert: opts.cert,
            date: new Date().toISOString(),
            correct: g.correct,
            total: g.total,
            passMark: mark,
            passed: g.correct >= mark,
            usedSeconds,
            byTopic: g.byTopic,
          }),
        );
      }
      setScreen({ name: 'result', opts, questions, answers, usedSeconds, isSample });
    },
    [errors],
  );

  const home = () => setScreen({ name: 'home' });

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={home} aria-label="Voltar ao início">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Simulador Anbima</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      {!online && (
        <div className="banner banner-warn" role="status">
          Você está sem internet. O simulador continua funcionando com as questões já carregadas.
        </div>
      )}

      <main className="main">
        {screen.name === 'home' && (
          <Home
            history={history}
            onStart={(cert) => start({ cert, mode: 'prova' })}
            onProgress={() => setScreen({ name: 'progress', cert: lastCert })}
            onPlan={() => setScreen({ name: 'plan', cert: lastCert })}
            onTrain={() => setScreen({ name: 'train', cert: lastCert })}
            errorCount={Object.keys(errors).length}
          />
        )}

        {screen.name === 'progress' && (
          <Progress
            history={history}
            initialCert={screen.cert}
            onPlan={(cert) => setScreen({ name: 'plan', cert })}
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
            mode={screen.opts.mode}
            topic={screen.opts.topic}
            minutes={screen.minutes}
            isSample={screen.isSample}
            onFinish={(answers, used) => finish(screen.opts, screen.questions, answers, used, screen.isSample)}
            onExit={home}
          />
        )}

        {screen.name === 'result' && (
          <Result
            cfg={EXAMS[screen.opts.cert]}
            questions={screen.questions}
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
