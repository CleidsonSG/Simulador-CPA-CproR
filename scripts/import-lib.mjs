// Validação dos arquivos de importação (funções puras, testadas em import-lib.test.mjs com dados fictícios).
// Formato: as mesmas colunas do banco (snake_case). Ver scripts/README-importacao.md.

export const CERTS = ['CPA', 'CPRO_R', 'CPRO_I'];
export const DIFFICULTIES = ['Baixa', 'Média', 'Alta'];
export const SOURCES = ['anbima', 'ia'];
export const STATUSES = ['publicada', 'revisao', 'arquivada'];

const str = (v) => typeof v === 'string' && v.trim().length > 0;

/** Devolve a lista de problemas da questão (vazia = válida). */
export function validateQuestion(q, scenarioCodes = new Set()) {
  const e = [];
  if (!q || typeof q !== 'object') return ['linha não é um objeto'];
  if (!str(q.source_code)) e.push('source_code obrigatório (código da questão na origem)');
  if (!CERTS.includes(q.cert)) e.push(`cert inválido: ${q.cert}`);
  if (!str(q.topic)) e.push('topic obrigatório');
  if (!DIFFICULTIES.includes(q.difficulty)) e.push(`difficulty inválida: ${q.difficulty}`);
  if (!Number.isInteger(q.year) || q.year < 2026) e.push(`year deve ser >= 2026 (veio ${q.year})`);
  if (!str(q.statement)) e.push('statement obrigatório');
  if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(str)) e.push('options deve ter 4 textos');
  if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) e.push('correct_index deve ser 0–3');
  if (q.source !== undefined && !SOURCES.includes(q.source)) e.push(`source inválido: ${q.source}`);
  if (q.status !== undefined && !STATUSES.includes(q.status)) e.push(`status inválido: ${q.status}`);
  if (q.explanation_source != null && !SOURCES.includes(q.explanation_source)) e.push('explanation_source deve ser anbima ou ia');
  if (q.pd_code != null && !/^\d+(\.\d+)*$/.test(q.pd_code)) e.push(`pd_code inválido: ${q.pd_code}`);
  if (q.scenario_code != null) {
    if (![1, 2].includes(q.scenario_pos)) e.push('scenario_pos deve ser 1 ou 2');
    if (!scenarioCodes.has(q.scenario_code)) e.push(`scenario_code ${q.scenario_code} não existe no arquivo de cenários nem no banco`);
  }
  return e;
}

export function validateScenario(s) {
  const e = [];
  if (!s || typeof s !== 'object') return ['linha não é um objeto'];
  if (!str(s.code)) e.push('code obrigatório');
  if (!CERTS.includes(s.cert)) e.push(`cert inválido: ${s.cert}`);
  if (!['mapa', 'caso'].includes(s.kind)) e.push(`kind inválido: ${s.kind}`);
  if (!Number.isInteger(s.year) || s.year < 2026) e.push(`year deve ser >= 2026 (veio ${s.year})`);
  if (s.status !== undefined && !STATUSES.includes(s.status)) e.push(`status inválido: ${s.status}`);
  const b = s.body;
  if (s.kind === 'caso' && !(b && typeof b.html === 'string' && b.html.trim())) e.push('caso precisa de body.html');
  if (s.kind === 'mapa') {
    if (!b || typeof b.rootKey !== 'string' || !b.nodes || !b.nodes[b.rootKey]) e.push('mapa precisa de body.rootKey existente em body.nodes');
    else
      for (const [k, n] of Object.entries(b.nodes)) {
        if (typeof n?.client !== 'string') e.push(`nó ${k}: client obrigatório`);
        if (!Array.isArray(n?.options)) e.push(`nó ${k}: options obrigatório`);
        for (const nx of n?.next ?? []) if (nx?.child && !b.nodes[nx.child]) e.push(`nó ${k}: child ${nx.child} não existe`);
      }
  }
  return e;
}

/** Conjuntos precisam de exatamente as posições 1 e 2. */
export function checkSets(questions) {
  const by = new Map();
  for (const q of questions) if (q.scenario_code) by.set(q.scenario_code, [...(by.get(q.scenario_code) ?? []), q.scenario_pos]);
  const e = [];
  for (const [code, pos] of by) if (pos.length !== 2 || !pos.includes(1) || !pos.includes(2)) e.push(`conjunto ${code}: posições ${pos.join(',')} (esperado 1 e 2)`);
  return e;
}

/** Lê um arquivo .env simples (CHAVE=valor), sem expor o conteúdo. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
