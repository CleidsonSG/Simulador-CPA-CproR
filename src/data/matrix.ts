import type { Cert, Question } from '../types';

/**
 * Macrotemas e proporções OFICIAIS da prova, conforme o Programa Detalhado de cada certificação
 * (vigência 01/01/2026): campo "Proporção" de cada macrotema.
 *  - CPA:     https://anbima.com.br/data/files/6A/52/6F/A1/BED73910B07B2739B82BA2A8/Programa-Detalhado-CPA-ANBIMA.pdf
 *  - C-Pro R: https://anbima.com.br/data/files/38/52/0D/A1/BED73910B07B2739B82BA2A8/Programa-Detalhado-C-Pro-R-ANBIMA.pdf
 * O 1º número do código do PD (ex.: 2.1.3) é o macrotema.
 */
export interface Macro {
  id: number;
  name: string;
  /** Fração das questões da prova (soma 1). */
  share: number;
}

export const MACROS: Record<Cert, Macro[]> = {
  CPA: [
    { id: 1, name: 'Estrutura e dinâmica do sistema financeiro nacional', share: 0.2 },
    { id: 2, name: 'Produtos do mercado financeiro', share: 0.4 },
    { id: 3, name: 'Relacionamento com o cliente (prospecção, atendimento e suporte)', share: 0.3 },
    { id: 4, name: 'Inovação e desenvolvimento de mercado', share: 0.1 },
  ],
  CPRO_R: [
    { id: 1, name: 'Prospecção e relacionamento com a pessoa investidora', share: 0.2 },
    { id: 2, name: 'Análise de informações do cliente', share: 0.2 },
    { id: 3, name: 'Indicação de investimentos', share: 0.4 },
    { id: 4, name: 'Análise de portfólio e monitoramento da carteira', share: 0.2 },
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
