export type Cert = 'CPA' | 'CPRO_R';
export type Difficulty = 'Baixa' | 'Média' | 'Alta';

export interface Question {
  id: string;
  cert: Cert;
  topic: string;
  difficulty: Difficulty;
  year: number;
  statement: string;
  /** Sempre 4 alternativas (A–D), como na prova real. */
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ExamConfig {
  cert: Cert;
  label: string;
  fullName: string;
  /** Nº de questões da prova real. */
  total: number;
  /** Percentual mínimo de acerto (CPA 70%, C-Pro R 71%). */
  passPct: number;
  /** Duração da prova real, em minutos. */
  minutes: number;
}

export type Answers = Record<string, number>;

export interface TopicScore {
  topic: string;
  correct: number;
  total: number;
}

export interface GradeResult {
  correct: number;
  total: number;
  pct: number;
  byTopic: TopicScore[];
}

export interface AttemptRecord {
  id: string;
  cert: Cert;
  date: string;
  correct: number;
  total: number;
  passMark: number;
  passed: boolean;
}
