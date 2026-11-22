#!/usr/bin/env node
// Uso: node scripts/validar-questoes-treino.mjs <lote.json> [saida.sql]
// Valida um lote de questões de TREINO (IA) pelas regras do Guia de elaboração da Anbima e, se tudo
// estiver certo, gera o SQL de importação (só para training_questions, em revisão).
import { readFileSync, writeFileSync } from 'node:fs';
import { gerarSql, validarLote } from './treino-lib.mjs';

const [entrada, saida] = process.argv.slice(2);
if (!entrada) {
  console.error('Uso: node scripts/validar-questoes-treino.mjs <lote.json> [saida.sql]');
  process.exit(2);
}
const lote = JSON.parse(readFileSync(entrada, 'utf8'));
if (!Array.isArray(lote) || lote.length === 0) {
  console.error('O arquivo deve conter uma lista (array) de questões.');
  process.exit(2);
}
const { itens, dist, avisosLote, ok } = validarLote(lote);
for (const { i, erros, avisos } of itens) {
  const status = erros.length ? '✗' : avisos.length ? '!' : '✓';
  console.log(`${status} ${i + 1}. ${String(lote[i].statement ?? '').slice(0, 70)}…`);
  for (const e of erros) console.log(`    erro: ${e}`);
  for (const a of avisos) console.log(`    aviso: ${a}`);
}
console.log(`\nGabarito por posição (A/B/C/D): ${dist.join(' / ')}`);
for (const a of avisosLote) console.log(`aviso do lote: ${a}`);
if (!ok) {
  console.log('\nLote com erros: nada foi gerado. Corrija e rode de novo.');
  process.exit(1);
}
if (saida) {
  writeFileSync(saida, gerarSql(lote));
  console.log(`\nSQL gerado em ${saida} (${lote.length} questões, destino: training_questions, em revisão).`);
} else {
  console.log('\nLote válido. Informe o arquivo de saída para gerar o SQL.');
}
