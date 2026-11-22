import { describe, expect, it } from 'vitest';
import { gerarSql, validarLote, validarQuestao } from './treino-lib.mjs';

// Questão inventada para o teste (nada do banco real).
const boa = {
  cert: 'CPA',
  pd_code: '3.1.3.4',
  topic: 'Finanças pessoais',
  difficulty: 'Média',
  statement:
    'Marina, 29 anos, tem renda mensal de R$ 6.000,00 e gastos fixos de R$ 4.000,00. Ela procura o gerente para montar a reserva de emergência antes de investir em ações. Considerando a finalidade dessa reserva, a orientação adequada do gerente é aplicar os recursos em:',
  options: [
    'Título pós-fixado com liquidez diária e baixa oscilação de preço.',
    'Ações de empresas com histórico de bons dividendos.',
    'Título prefixado de longo prazo com taxa atrativa.',
    'Fundo multimercado com prazo de resgate em 60 dias.',
  ],
  correct_index: 0,
  explanation:
    'A) Correta. A reserva precisa de liquidez e baixa oscilação. B) Incorreta. Ações oscilam. C) Incorreta. Prefixado longo sofre marcação a mercado. D) Incorreta. O prazo de resgate impede o uso imediato.',
  revisao: { veredito: 'aprovada', revisor: 'revisor-questoes' },
};

describe('validação das questões de treino (IA)', () => {
  it('aceita uma questão no padrão do Guia', () => {
    expect(validarQuestao(boa).erros).toEqual([]);
  });

  it('recusa sem aprovação do revisor independente', () => {
    expect(validarQuestao({ ...boa, revisao: undefined }).erros.join()).toMatch(/revisor/);
  });

  it('recusa "todas as anteriores", alternativas repetidas e explicação sem letras', () => {
    const r = validarQuestao({
      ...boa,
      options: ['x', 'x', 'Todas as anteriores', 'y'],
      explanation: 'Porque sim.',
    });
    expect(r.erros.join(' | ')).toMatch(/repetidas/);
    expect(r.erros.join(' | ')).toMatch(/cita outras alternativas/);
    expect(r.erros.join(' | ')).toMatch(/justificar cada alternativa/);
  });

  it('recusa pd_code fora dos macrotemas e certificação inválida', () => {
    expect(validarQuestao({ ...boa, pd_code: '7.1' }).erros.join()).toMatch(/fora dos macrotemas/);
    expect(validarQuestao({ ...boa, cert: 'CEA' }).erros.join()).toMatch(/cert inválida/);
  });

  it('avisa termo absoluto e enunciado negativo', () => {
    const r = validarQuestao({ ...boa, statement: boa.statement + ' Assinale a alternativa incorreta.', options: [...boa.options.slice(0, 3), 'Nunca aplicar em renda fixa.'] });
    expect(r.avisos.join()).toMatch(/negativa/);
    expect(r.avisos.join()).toMatch(/absoluto/);
  });

  it('acusa enunciado repetido no lote', () => {
    const { ok, itens } = validarLote([boa, { ...boa }]);
    expect(ok).toBe(false);
    expect(itens[1].erros.join()).toMatch(/repetido/);
  });

  it('SQL só chama insert_generated_question (treino, em revisão), nunca a tabela oficial', () => {
    const sql = gerarSql([{ ...boa, statement: 'Texto com $q$ e aspas \' dentro' }]);
    expect(sql).toMatch(/insert_generated_question/);
    expect(sql).not.toMatch(/insert into public\.questions/i);
    expect(sql).toMatch(/\$qq\$Texto com \$q\$/); // dollar-quoting escapa a própria tag
  });
});
