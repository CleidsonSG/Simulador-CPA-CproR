export type Cert = 'CPA' | 'CPRO_R';
/** prova = simulado completo; treino = só um tema; erros = refazer o caderno de erros. */
export type Mode = 'prova' | 'treino' | 'erros';
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
  /**
   * anbima = texto original, IMUTÁVEL (nem as alternativas podem ser reordenadas);
   * ia = criada pelo agente criador de questões; exemplo = questões de demonstração do projeto.
   */
  source: 'anbima' | 'ia' | 'exemplo';
  /** Código do Programa Detalhado (ex.: 2.1.3). O 1º número é o macrotema. */
  pdCode?: string;
  /** Quem escreveu a explicação: a própria Anbima ou a IA. */
  explanationSource?: 'anbima' | 'ia';
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
  /** Tempo gasto (s) e desempenho por tema; ausentes em registros antigos. */
  usedSeconds?: number;
  byTopic?: TopicScore[];
}
