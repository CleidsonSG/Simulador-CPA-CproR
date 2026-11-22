import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cert, Difficulty, MapBody, Question, Scenario } from '../types';

/* Conversão das linhas do banco (snake_case) para os tipos do app. Funções puras: testadas sem rede. */

export interface QuestionRow {
  id: string;
  cert: Cert;
  topic: string;
  pd_code: string | null;
  difficulty: Difficulty;
  year: number;
  statement: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  source: Question['source'];
  explanation_source: 'anbima' | 'ia' | null;
  scenario_code: string | null;
  scenario_pos: number | null;
  source_code?: string | null;
}

export interface ScenarioRow {
  code: string;
  cert: Cert;
  kind: 'mapa' | 'caso';
  year: number;
  topic: string | null;
  pd_code: string | null;
  body: unknown;
  source: 'anbima' | 'ia';
}

export const QUESTION_COLS =
  'id,cert,topic,pd_code,difficulty,year,statement,options,correct_index,explanation,source,explanation_source,scenario_code,scenario_pos,source_code';
export const SCENARIO_COLS = 'code,cert,kind,year,topic,pd_code,body,source';

/** Linha inválida (alternativas ≠ 4, gabarito fora de 0–3, ano < 2026) vira null e fica fora da prova. */
export function rowToQuestion(r: QuestionRow): Question | null {
  const opts = Array.isArray(r.options) ? r.options.map(String) : null;
  if (!opts || opts.length !== 4 || r.correct_index < 0 || r.correct_index > 3 || r.year < 2026) return null;
  const q: Question = {
    id: r.id,
    cert: r.cert,
    topic: r.topic,
    difficulty: r.difficulty,
    year: r.year,
    statement: r.statement,
    options: opts,
    correctIndex: r.correct_index,
    explanation: r.explanation ?? '',
    source: r.source,
  };
  if (r.pd_code) q.pdCode = r.pd_code;
  if (r.source_code) q.sourceCode = r.source_code;
  if (r.explanation_source) q.explanationSource = r.explanation_source;
  if (r.scenario_code) {
    q.scenarioCode = r.scenario_code;
    q.scenarioPos = r.scenario_pos ?? undefined;
  }
  return q;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isMapBody(b: unknown): b is MapBody {
  if (!isObj(b) || typeof b.rootKey !== 'string' || !isObj(b.nodes) || !isObj(b.nodes[b.rootKey])) return false;
  return Object.values(b.nodes).every(
    (n) => isObj(n) && typeof n.client === 'string' && Array.isArray(n.options) && Array.isArray(n.next ?? []),
  );
}

export function rowToScenario(r: ScenarioRow): Scenario | null {
  if (r.year < 2026) return null;
  const base = {
    code: r.code,
    cert: r.cert,
    year: r.year,
    topic: r.topic ?? '',
    title: r.topic || `${r.kind === 'mapa' ? 'Mapa' : 'Caso'} ${r.code}`,
    source: r.source,
    ...(r.pd_code ? { pdCode: r.pd_code } : {}),
  };
  if (r.kind === 'mapa') {
    if (!isMapBody(r.body)) return null;
    const b = r.body;
    const nodes = Object.fromEntries(
      Object.entries(b.nodes).map(([k, n]) => [k, { ...n, next: Array.isArray(n.next) ? n.next : [] }]),
    );
    return { ...base, kind: 'mapa', body: { intro: String(b.intro ?? ''), pergunta: String(b.pergunta ?? ''), rootKey: b.rootKey, nodes } };
  }
  if (!isObj(r.body) || typeof r.body.html !== 'string') return null;
  return { ...base, kind: 'caso', body: { html: r.body.html } };
}

const PAGE = 1000;

/** Banco publicado da certificação (múltipla escolha + questões e cenários de conjunto). Lê em páginas de 1000. */
export async function fetchBank(sb: SupabaseClient, cert: Cert): Promise<{ questions: Question[]; scenarios: Scenario[] }> {
  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('questions')
      .select(QUESTION_COLS)
      .eq('cert', cert)
      .eq('status', 'publicada')
      .neq('source', 'ia') // questão de IA nunca no banco oficial do app (migração 0009)
      .gte('year', 2026)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as QuestionRow[]));
    if (!data || data.length < PAGE) break;
  }
  const { data: sc, error: scErr } = await sb
    .from('question_scenarios')
    .select(SCENARIO_COLS)
    .eq('cert', cert)
    .eq('status', 'publicada')
    .gte('year', 2026);
  if (scErr) throw scErr;
  return {
    questions: rows.map(rowToQuestion).filter((q): q is Question => q !== null),
    scenarios: ((sc ?? []) as ScenarioRow[]).map(rowToScenario).filter((s): s is Scenario => s !== null),
  };
}
