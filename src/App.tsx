import { useCallback, useEffect, useState } from 'react';
import type { Answers, AttemptRecord, Cert, Question } from './types';
import { EXAMS, buildExam, examSize, grade, minutesFor, passMark } from './lib/exam';
import { loadHistory, loadTheme, saveAttempt, saveTheme } from './lib/storage';
import { loadQuestions } from './data/source';
import { Home } from './components/Home';
import { Quiz } from './components/Quiz';
import { Result } from './components/Result';

type Screen =
  | { name: 'home' }
  | { name: 'loading'; cert: Cert }
  | { name: 'error'; cert: Cert }
  | { name: 'quiz'; cert: Cert; questions: Question[]; minutes: number; isSample: boolean }
  | { name: 'result'; cert: Cert; questions: Question[]; answers: Answers; usedSeconds: number; isSample: boolean };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [history, setHistory] = useState<AttemptRecord[]>(() => loadHistory());
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

  const start = useCallback(async (cert: Cert) => {
    setScreen({ name: 'loading', cert });
    try {
      const bank = await loadQuestions(cert);
      const cfg = EXAMS[cert];
      const questions = buildExam(cfg, bank.questions);
      if (questions.length === 0) {
        setScreen({ name: 'error', cert });
        return;
      }
      setScreen({ name: 'quiz', cert, questions, minutes: minutesFor(cfg, questions.length), isSample: bank.isSample });
    } catch {
      setScreen({ name: 'error', cert });
    }
  }, []);

  const finish = useCallback(
    (cert: Cert, questions: Question[], answers: Answers, usedSeconds: number, isSample: boolean) => {
      const cfg = EXAMS[cert];
      const g = grade(questions, answers);
      const mark = passMark(cfg, questions.length);
      setHistory(
        saveAttempt({
          id: `${Date.now()}`,
          cert,
          date: new Date().toISOString(),
          correct: g.correct,
          total: g.total,
          passMark: mark,
          passed: g.correct >= mark,
        }),
      );
      setScreen({ name: 'result', cert, questions, answers, usedSeconds, isSample });
    },
    [],
  );

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen({ name: 'home' })} aria-label="Voltar ao início">
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
        {screen.name === 'home' && <Home history={history} onStart={start} />}

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
            <h2>Não foi possível montar o simulado</h2>
            <p>Não há questões disponíveis para {EXAMS[screen.cert].label} ou houve uma falha ao carregar.</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => start(screen.cert)}>Tentar de novo</button>
              <button className="btn" onClick={() => setScreen({ name: 'home' })}>Voltar</button>
            </div>
          </div>
        )}

        {screen.name === 'quiz' && (
          <Quiz
            cfg={EXAMS[screen.cert]}
            questions={screen.questions}
            minutes={screen.minutes}
            isSample={screen.isSample}
            onFinish={(answers, used) => finish(screen.cert, screen.questions, answers, used, screen.isSample)}
            onExit={() => setScreen({ name: 'home' })}
          />
        )}

        {screen.name === 'result' && (
          <Result
            cfg={EXAMS[screen.cert]}
            questions={screen.questions}
            answers={screen.answers}
            usedSeconds={screen.usedSeconds}
            isSample={screen.isSample}
            size={examSize(EXAMS[screen.cert], screen.questions.length)}
            onRetry={() => start(screen.cert)}
            onHome={() => setScreen({ name: 'home' })}
          />
        )}
      </main>
    </div>
  );
}
