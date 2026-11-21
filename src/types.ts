export type Cert = 'CPA' | 'CPRO_R' | 'CPRO_I';
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
  /** Questão de conjunto (mapa de decisão ou caso): código do cenário e posição (1 ou 2). */
  scenarioCode?: string;
  scenarioPos?: number;
}

/** Nó do mapa de decisão: fala do cliente e 4 respostas possíveis do gerente (sem gabarito). */
export interface MapNode {
  client: string;
  /** Pergunta-guia do nó (opcional; senão vale a pergunta geral do mapa). */
  pergunta?: string;
  options: string[];
  /** next[i] corresponde a options[i]: fala do gerente (senão, a própria opção) e chave do próximo nó. */
  next: { gerente?: string; child?: string | null }[];
  end?: boolean;
  endText?: string;
}

export interface MapBody {
  intro: string;
  pergunta: string;
  rootKey: string;
  nodes: Record<string, MapNode>;
}

export interface CaseBody {
  /** Texto-base com tabelas. Sempre passa por sanitizeHtml antes de ir para a tela. */
  html: string;
}

/** Conjunto da prova (tabela question_scenarios): um mapa ou um caso + 2 questões em `questions`. */
export type Scenario = {
  code: string;
  cert: Cert;
  year: number;
  topic: string;
  title: string;
  pdCode?: string;
  source: 'anbima' | 'ia' | 'exemplo';
} & ({ kind: 'mapa'; body: MapBody } | { kind: 'caso'; body: CaseBody });

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
  /** Conjuntos (mapas/casos) por prova, 2 questões cada, dentro do total: CPA 5, C-Pro R 7, C-Pro I 5. */
  sets: number;
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
