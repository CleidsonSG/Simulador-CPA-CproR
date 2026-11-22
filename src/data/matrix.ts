import type { Cert, Question } from '../types';

/**
 * Macrotemas e proporções OFICIAIS da prova, conforme o Programa Detalhado de cada certificação
 * (vigência 01/01/2026): campo "Proporção" de cada macrotema.
 *  - CPA:     https://anbima.com.br/data/files/6A/52/6F/A1/BED73910B07B2739B82BA2A8/Programa-Detalhado-CPA-ANBIMA.pdf
 *  - C-Pro R: https://anbima.com.br/data/files/38/52/0D/A1/BED73910B07B2739B82BA2A8/Programa-Detalhado-C-Pro-R-ANBIMA.pdf
 *  - C-Pro I: https://www.anbima.com.br/data/files/9B/82/78/94/12793910A5947839EA2BA2A8/Programa-Detalhado-C-Pro-I.pdf
 * O 1º número do código do PD (ex.: 2.1.3) é o macrotema.
 */
export interface Macro {
  id: number;
  name: string;
  /** Nome curto, para resumos (ex.: "Análise do cliente"). */
  short: string;
  /** Fração das questões da prova (soma 1). */
  share: number;
}

export const MACROS: Record<Cert, Macro[]> = {
  CPA: [
    { id: 1, name: 'Estrutura e dinâmica do sistema financeiro nacional', short: 'Sistema financeiro nacional', share: 0.2 },
    { id: 2, name: 'Produtos do mercado financeiro', short: 'Produtos do mercado financeiro', share: 0.4 },
    { id: 3, name: 'Relacionamento com o cliente (prospecção, atendimento e suporte)', short: 'Relacionamento com o cliente', share: 0.3 },
    { id: 4, name: 'Inovação e desenvolvimento de mercado', short: 'Inovação e desenvolvimento de mercado', share: 0.1 },
  ],
  CPRO_R: [
    { id: 1, name: 'Prospecção e relacionamento com a pessoa investidora', short: 'Prospecção e relacionamento', share: 0.2 },
    { id: 2, name: 'Análise de informações do cliente', short: 'Análise do cliente', share: 0.2 },
    { id: 3, name: 'Indicação de investimentos', short: 'Indicação de investimentos', share: 0.4 },
    { id: 4, name: 'Análise de portfólio e monitoramento da carteira', short: 'Portfólio e monitoramento', share: 0.2 },
  ],
  CPRO_I: [
    { id: 1, name: 'Produtos de investimentos', short: 'Produtos de investimentos', share: 0.4 },
    { id: 2, name: 'Investimentos alternativos, digitais e no exterior', short: 'Alternativos, digitais e exterior', share: 0.15 },
    { id: 3, name: 'Previdência complementar', short: 'Previdência complementar', share: 0.25 },
    { id: 4, name: 'Gestão de risco, análise de carteiras e indicadores de performance', short: 'Risco, carteiras e performance', share: 0.2 },
  ],
};

/** Macrotema (1–4) a partir do código do PD; undefined se não houver código válido. */
export function macroOf(pdCode?: string): number | undefined {
  const m = /^([1-4])(\.|$)/.exec(pdCode ?? '');
  return m ? Number(m[1]) : undefined;
}

export function shareOf(cert: Cert, macro: number): number | undefined {
  return MACROS[cert].find((m) => m.id === macro)?.share;
}

/**
 * Peso relativo de cada tema para o plano de estudos: a proporção do macrotema dividida
 * pelo nº de temas dele. Assim, cada macrotema recebe tempo proporcional ao seu peso na prova.
 * Temas sem código do PD recebem a média dos demais.
 */
export function topicWeights(cert: Cert, questions: readonly Pick<Question, 'topic' | 'pdCode'>[]): Record<string, number> {
  const macroOfTopic = new Map<string, number | undefined>();
  for (const q of questions) if (!macroOfTopic.has(q.topic)) macroOfTopic.set(q.topic, macroOf(q.pdCode));
  const perMacro = new Map<number, number>();
  for (const m of macroOfTopic.values()) if (m !== undefined) perMacro.set(m, (perMacro.get(m) ?? 0) + 1);

  const out: Record<string, number> = {};
  const known: number[] = [];
  for (const [topic, m] of macroOfTopic) {
    const share = m === undefined ? undefined : shareOf(cert, m);
    if (m !== undefined && share !== undefined) {
      out[topic] = share / (perMacro.get(m) ?? 1);
      known.push(out[topic]);
    }
  }
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  for (const topic of macroOfTopic.keys()) if (out[topic] === undefined) out[topic] = avg;
  return out;
}

/**
 * Nº de questões de cada macrotema numa prova de `total` questões: peso oficial × total,
 * arredondado pelo maior resto (a soma sempre fecha o total da prova).
 */
export function questionsPerMacro(cert: Cert, total: number): { macro: Macro; questions: number }[] {
  const raw = MACROS[cert].map((m) => ({ macro: m, exact: m.share * total }));
  const out = raw.map((r) => ({ macro: r.macro, questions: Math.floor(r.exact) }));
  let left = total - out.reduce((a, r) => a + r.questions, 0);
  const order = raw.map((r, i) => ({ i, rest: r.exact - Math.floor(r.exact) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i].questions++;
    left--;
  }
  return out;
}
