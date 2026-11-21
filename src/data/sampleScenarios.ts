import type { MapBody, Question, Scenario } from '../types';

/**
 * CONJUNTOS DE EXEMPLO (mapas de decisão e casos) — escritos para este projeto, NÃO são da Anbima.
 * Só demonstram o formato. Os conjuntos reais ficam no Supabase (question_scenarios), nunca aqui.
 * Como no portal, o gabarito das questões de conjunto está gravado na alternativa A; a tela embaralha a exibição.
 */

const sq = (
  id: string,
  cert: Question['cert'],
  scenarioCode: string,
  scenarioPos: 1 | 2,
  pdCode: string,
  topic: string,
  difficulty: Question['difficulty'],
  statement: string,
  options: [string, string, string, string],
  explanation: string,
): Question => ({
  id, cert, pdCode, topic, difficulty, year: 2026, statement, options, correctIndex: 0, explanation,
  source: 'exemplo', explanationSource: 'ia', scenarioCode, scenarioPos,
});

/** Mapa curto: nó inicial com 4 respostas que levam a 2 ramos; cada ramo tem 4 respostas finais. */
const map = (
  intro: string,
  pergunta: string,
  root: { client: string; options: [string, string, string, string]; go: [0 | 1, 0 | 1, 0 | 1, 0 | 1] },
  branches: [{ client: string; options: string[] }, { client: string; options: string[] }],
  endText: string,
): MapBody => ({
  intro,
  pergunta,
  rootKey: 'n0',
  nodes: {
    n0: { client: root.client, options: root.options, next: root.go.map((b) => ({ child: `n${b + 1}` })) },
    n1: { client: branches[0].client, options: branches[0].options, next: branches[0].options.map(() => ({ child: null })), end: true, endText },
    n2: { client: branches[1].client, options: branches[1].options, next: branches[1].options.map(() => ({ child: null })), end: true, endText },
  },
});

export const SAMPLE_SCENARIOS: Scenario[] = [
  // ───────────── CPA ─────────────
  {
    code: 'EX-CPA-M1', cert: 'CPA', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '3.4.2',
    topic: 'Suitability e código de distribuição da Anbima', title: 'Reserva de emergência na bolsa',
    body: map(
      'Marta, 34 anos, perfil conservador, tem R$ 30 mil guardados como reserva de emergência. Ela procura você na agência.',
      'Como você conduz o atendimento?',
      {
        client: 'Vi no jornal que a bolsa caiu bastante. Quero colocar toda a minha reserva em ações agora, antes que suba de novo!',
        options: [
          'Boa ideia! Queda é oportunidade, vamos comprar hoje mesmo.',
          'Antes de decidir, quero entender para que serve esse dinheiro e se seu perfil continua o mesmo.',
          'Ações sempre se recuperam no longo prazo, pode ficar tranquila.',
          'Vamos olhar juntos seus objetivos e o prazo em que você pode precisar desse valor.',
        ],
        go: [0, 1, 0, 1],
      },
      [
        {
          client: 'Mas e se eu precisar do dinheiro de repente, por exemplo, se ficar sem emprego?',
          options: [
            'Aí você vende, a bolsa tem liquidez em D+2.',
            'Nesse caso pode haver perda: ações oscilam e não são indicadas para reserva de emergência.',
            'Se cair mais, a gente espera; não tem problema.',
            'Posso garantir que até lá já terá subido.',
          ],
        },
        {
          client: 'É o dinheiro para imprevistos. Não posso ficar sem ele. Ainda assim posso investir em ações?',
          options: [
            'A reserva deve ficar em algo com liquidez e baixa oscilação; para ações, podemos pensar em outro valor e prazo.',
            'Pode, mas coloque tudo de uma vez para aproveitar a queda.',
            'Pode, ações são garantidas pelo FGC.',
            'Pode sim, ignore o seu perfil desta vez.',
          ],
        },
      ],
      'Marta agradece a conversa e diz que vai pensar. Responda às duas questões sobre o atendimento.',
    ),
  },
  {
    code: 'EX-CPA-M2', cert: 'CPA', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '2.2.2',
    topic: 'Regimes de tributação (progressivo e regressivo)', title: 'Previdência para quem faz declaração simplificada',
    body: map(
      'Roberto, 45 anos, é assalariado e faz a declaração de IR no modelo simplificado. Quer começar uma previdência privada para a aposentadoria, daqui a 20 anos.',
      'Como você orienta Roberto?',
      {
        client: 'Um amigo disse que o PGBL é sempre melhor porque abate do imposto. Vale para mim também?',
        options: [
          'Vale sim, PGBL é melhor para todo mundo.',
          'Depende: o benefício fiscal do PGBL só existe para quem declara no modelo completo. Como você usa o simplificado…',
          'Tanto faz PGBL ou VGBL, são iguais.',
          'Antes, me conte: você pensa em mudar para a declaração completa?',
        ],
        go: [0, 1, 0, 1],
      },
      [
        {
          client: 'Então eu abato as contribuições mesmo no simplificado?',
          options: [
            'Não. No simplificado não há dedução das contribuições ao PGBL; o VGBL tende a ser mais adequado.',
            'Sim, até 12% da renda.',
            'Sim, sem limite.',
            'Só se o plano for de banco público.',
          ],
        },
        {
          client: 'Não pretendo mudar. E quanto ao regime de tributação, qual escolho para 20 anos?',
          options: [
            'Para prazo longo, o regressivo costuma ser melhor: a alíquota cai até 10% após 10 anos.',
            'O progressivo, porque a alíquota é sempre 10%.',
            'Tanto faz, ambos têm a mesma alíquota.',
            'Nenhum, previdência é isenta.',
          ],
        },
      ],
      'Roberto quer simular os valores. Responda às duas questões sobre a orientação.',
    ),
  },
  {
    code: 'EX-CPA-C1', cert: 'CPA', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '2.1.1',
    topic: 'Instrumentos de renda variável e renda fixa', title: 'Comparando CDB, LCI e Tesouro',
    body: {
      html: `<p>Ana, pessoa física, quer aplicar R$ 100 mil por <b>3 anos</b> e não precisará do dinheiro antes. O gerente apresentou três opções, todas com vencimento em 3 anos:</p>
<table>
<thead><tr><th scope="col">Produto</th><th scope="col">Rentabilidade bruta</th><th scope="col">IR para PF</th></tr></thead>
<tbody>
<tr><td>CDB do Banco X</td><td>12,0% ao ano</td><td>Tabela regressiva</td></tr>
<tr><td>LCI do Banco X</td><td>10,5% ao ano</td><td>Isenta</td></tr>
<tr><td>Tesouro Prefixado</td><td>11,5% ao ano</td><td>Tabela regressiva</td></tr>
</tbody>
</table>
<p>Considere a alíquota de IR do prazo total da aplicação e ignore custos e taxas.</p>`,
    },
  },

  // ───────────── C-Pro R ─────────────
  {
    code: 'EX-CPR-M1', cert: 'CPRO_R', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '2.4',
    topic: 'Análise do perfil do investidor', title: 'Concentração após a alta',
    body: map(
      'Paulo, 52 anos, tem perfil moderado e uma carteira de R$ 800 mil bem diversificada. Um fundo de ações da carteira subiu 30% no ano.',
      'Como você conduz a conversa?',
      {
        client: 'Esse fundo de ações está voando. Quero passar 80% da carteira para ele.',
        options: [
          'Faço agora, o cliente é quem manda.',
          'Entendo o entusiasmo. Antes, vamos ver como isso mudaria o risco da sua carteira e se combina com o seu perfil.',
          'Retorno passado garante retorno futuro, pode concentrar.',
          'Posso mostrar o que aconteceria com a carteira numa queda forte de ações?',
        ],
        go: [0, 1, 0, 1],
      },
      [
        {
          client: 'Pronto, já decidi. E se eu fizer a ordem mesmo assim?',
          options: [
            'Posso executar, mas antes alerto que é inadequado ao seu perfil e preciso da sua declaração expressa de ciência.',
            'Executo sem registrar nada.',
            'Não é possível, a regra proíbe qualquer operação fora do perfil.',
            'Mudo seu perfil para agressivo sem novo questionário.',
          ],
        },
        {
          client: 'Uma queda de 30% me tiraria o sono. Mas não quero perder a alta.',
          options: [
            'Podemos aumentar um pouco a parcela em ações, dentro do limite do seu perfil, mantendo a diversificação.',
            'Então concentre tudo, a alta vai continuar.',
            'Venda tudo e fique só no CDI para sempre.',
            'Não se preocupe, fundos de ações têm garantia do FGC.',
          ],
        },
      ],
      'Paulo pede uma proposta por escrito. Responda às duas questões sobre o atendimento.',
    ),
  },
  {
    code: 'EX-CPR-M2', cert: 'CPRO_R', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '4.2',
    topic: 'Planejamento de investimentos para eventos ou novos objetivos', title: 'Entrada do apartamento em 8 meses',
    body: map(
      'Juliana, 29 anos, juntou R$ 120 mil para a entrada de um apartamento. A assinatura do contrato está prevista para daqui a 8 meses.',
      'Como você orienta Juliana?',
      {
        client: 'Ouvi falar que o Tesouro IPCA+ 2045 paga muito bem. Coloco tudo lá até a compra?',
        options: [
          'Sim, é título público, não tem risco nenhum.',
          'Para um objetivo com data marcada em 8 meses, precisamos olhar liquidez e oscilação de preço antes da taxa.',
          'Sim, e se o preço cair você espera até 2045.',
          'Se a data atrasar alguns meses, isso mudaria seu plano?',
        ],
        go: [0, 1, 0, 1],
      },
      [
        {
          client: 'Mas por que o preço de um título público pode cair?',
          options: [
            'Pela marcação a mercado: se os juros sobem, o título longo perde valor antes do vencimento.',
            'Porque o governo pode deixar de pagar a qualquer momento.',
            'Não cai; o preço é fixo até o vencimento.',
            'Só cai se a inflação for zero.',
          ],
        },
        {
          client: 'A data é certa. Então o que você sugere?',
          options: [
            'Algo pós-fixado com liquidez e baixa volatilidade, como Tesouro Selic ou CDB com liquidez diária.',
            'Ações de empresas de construção, que combinam com o objetivo.',
            'Um fundo multimercado alavancado.',
            'Tesouro IPCA+ 2045, com resgate antecipado.',
          ],
        },
      ],
      'Juliana pede que você monte a alocação. Responda às duas questões sobre o planejamento.',
    ),
  },
  {
    code: 'EX-CPR-C1', cert: 'CPRO_R', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '4.1',
    topic: 'Boas práticas de rebalanceamento da carteira', title: 'Carteira fora da alocação-alvo',
    body: {
      html: `<p>A política de investimentos de Carlos (pessoa física) define <b>60% em renda fixa e 40% em ações</b>, com rebalanceamento quando o desvio passar de 5 pontos percentuais. Hoje a carteira está assim:</p>
<table>
<thead><tr><th scope="col">Classe</th><th scope="col">Valor atual</th><th scope="col">Alvo</th></tr></thead>
<tbody>
<tr><td>Renda fixa</td><td>R$ 250.000</td><td>60%</td></tr>
<tr><td>Ações (compradas diretamente na bolsa)</td><td>R$ 250.000</td><td>40%</td></tr>
<tr><th scope="row">Total</th><td>R$ 500.000</td><td>100%</td></tr>
</tbody>
</table>
<p>As ações têm lucro acumulado. Carlos não fez outras vendas de ações neste mês e as operações são comuns (não são day trade).</p>`,
    },
  },
  {
    code: 'EX-CPR-C2', cert: 'CPRO_R', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '4.8',
    topic: 'Desvio padrão da carteira e o benefício da diversificação', title: 'Retorno e risco de dois fundos',
    body: {
      html: `<p>Uma cliente quer escolher entre dois fundos multimercado. Dados dos últimos 36 meses (ao ano):</p>
<table>
<thead><tr><th scope="col">Fundo</th><th scope="col">Retorno médio</th><th scope="col">Desvio-padrão</th></tr></thead>
<tbody>
<tr><td>Fundo Alfa</td><td>14%</td><td>8%</td></tr>
<tr><td>Fundo Beta</td><td>15%</td><td>12%</td></tr>
</tbody>
</table>
<p>Taxa livre de risco (CDI) no período: <b>10% ao ano</b>.</p>`,
    },
  },

  // ───────────── C-Pro I ─────────────
  {
    code: 'EX-CPI-C1', cert: 'CPRO_I', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '4.1',
    topic: 'Risco, retorno e mercado', title: 'Sensibilidade de títulos à taxa de juros',
    body: {
      html: `<p>Um gestor analisa três títulos prefixados para a carteira de um cliente:</p>
<table>
<thead><tr><th scope="col">Título</th><th scope="col">Cupom</th><th scope="col">Vencimento</th><th scope="col">Duration modificada</th></tr></thead>
<tbody>
<tr><td>Título 1</td><td>Sem cupom</td><td>2 anos</td><td>1,8</td></tr>
<tr><td>Título 2</td><td>10% ao ano</td><td>5 anos</td><td>3,6</td></tr>
<tr><td>Título 3</td><td>Sem cupom</td><td>8 anos</td><td>7,1</td></tr>
</tbody>
</table>
<p>Use a aproximação: variação do preço ≈ − duration modificada × variação da taxa.</p>`,
    },
  },
  {
    code: 'EX-CPI-C2', cert: 'CPRO_I', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '3.4',
    topic: 'PGBL', title: 'Dedução do PGBL na declaração completa',
    body: {
      html: `<p>Fernanda tem renda bruta tributável anual de <b>R$ 200.000</b>, declara IR no <b>modelo completo</b> e já contribui para o INSS. Ela quer abrir um PGBL e pretende resgatar só daqui a mais de 15 anos.</p>
<table>
<thead><tr><th scope="col">Item</th><th scope="col">Valor</th></tr></thead>
<tbody>
<tr><td>Renda bruta tributável anual</td><td>R$ 200.000</td></tr>
<tr><td>Contribuição anual pretendida ao PGBL</td><td>R$ 30.000</td></tr>
</tbody>
</table>`,
    },
  },
];

export const SAMPLE_SCENARIO_QUESTIONS: Question[] = [
  // CPA
  sq('ex-set-cpa-m1-1', 'CPA', 'EX-CPA-M1', 1, '3.4.2', 'Suitability e código de distribuição da Anbima', 'Baixa',
    'No atendimento a Marta, qual deveria ser a primeira providência do gerente?',
    ['Entender o objetivo do recurso e confirmar se o perfil dela continua atual', 'Executar a compra de ações imediatamente, pois a cliente pediu', 'Recusar qualquer conversa sobre renda variável', 'Garantir que as ações vão se recuperar no longo prazo'],
    'O suitability exige conhecer objetivo, situação financeira e tolerância a risco antes de recomendar. Prometer recuperação é garantir rentabilidade, o que é vedado.'),
  sq('ex-set-cpa-m1-2', 'CPA', 'EX-CPA-M1', 2, '2.1.1', 'Instrumentos de renda variável e renda fixa', 'Baixa',
    'Para a reserva de emergência de Marta, qual aplicação é mais adequada?',
    ['Tesouro Selic ou CDB com liquidez diária', 'Ações de uma única empresa', 'Tesouro IPCA+ com vencimento em 20 anos', 'Fundo de ações com resgate em D+30'],
    'Reserva de emergência pede liquidez e baixa oscilação de preço. Ações e títulos longos podem estar em queda justamente quando o dinheiro for necessário.'),
  sq('ex-set-cpa-m2-1', 'CPA', 'EX-CPA-M2', 1, '2.2.2', 'Regimes de tributação (progressivo e regressivo)', 'Média',
    'Considerando que Roberto declara no modelo simplificado, qual plano tende a ser mais adequado?',
    ['VGBL, porque ele não aproveitaria a dedução das contribuições do PGBL', 'PGBL, porque abate até 12% da renda bruta em qualquer modelo de declaração', 'PGBL, porque é isento de IR no resgate', 'Nenhum, pois previdência é vedada a assalariados'],
    'A dedução de até 12% da renda bruta tributável vale só para quem declara no modelo completo. No VGBL, o IR incide apenas sobre os rendimentos no resgate.'),
  sq('ex-set-cpa-m2-2', 'CPA', 'EX-CPA-M2', 2, '2.2.2', 'Regimes de tributação (progressivo e regressivo)', 'Média',
    'Para um horizonte de 20 anos, qual regime de tributação tende a ser mais vantajoso para Roberto?',
    ['Regressivo, com alíquota de 10% para recursos acumulados há mais de 10 anos', 'Progressivo, com alíquota fixa de 10% no resgate', 'Regressivo, com alíquota de 35% após 10 anos', 'Progressivo, por ser isento após 20 anos'],
    'No regime regressivo a alíquota começa em 35% e cai a cada 2 anos, chegando a 10% após 10 anos. No progressivo, há retenção de 15% no resgate e ajuste na declaração pela tabela do IR.'),
  sq('ex-set-cpa-c1-1', 'CPA', 'EX-CPA-C1', 1, '2.2.2', 'Regimes de tributação (progressivo e regressivo)', 'Média',
    'Qual opção oferece a maior rentabilidade líquida anual aproximada para Ana?',
    ['LCI, com 10,5% ao ano líquidos', 'CDB, com 12,0% ao ano líquidos', 'Tesouro Prefixado, com 11,5% ao ano líquidos', 'CDB, com 10,2% ao ano líquidos, que é a maior entre as três'],
    'Acima de 720 dias a alíquota é 15%. CDB: 12,0% × 0,85 = 10,2%. Tesouro: 11,5% × 0,85 ≈ 9,8%. LCI é isenta para pessoa física: 10,5%, a maior.'),
  sq('ex-set-cpa-c1-2', 'CPA', 'EX-CPA-C1', 2, '2.1.1', 'Instrumentos de renda variável e renda fixa', 'Média',
    'Sobre a garantia do FGC nas opções apresentadas, é correto afirmar que:',
    ['CDB e LCI têm cobertura do FGC; o Tesouro Prefixado não, pois o risco é do Tesouro Nacional', 'Só o Tesouro Prefixado tem cobertura do FGC', 'Nenhuma das três tem cobertura do FGC', 'As três têm cobertura ilimitada do FGC'],
    'CDB e LCI são cobertos pelo FGC até R$ 250 mil por CPF e por instituição (com teto global). Títulos públicos não têm FGC: o risco é soberano.'),

  // C-Pro R
  sq('ex-set-cpr-m1-1', 'CPRO_R', 'EX-CPR-M1', 1, '2.4', 'Análise do perfil do investidor', 'Média',
    'Se Paulo insistir em uma aplicação inadequada ao seu perfil, o que a regulação de suitability permite?',
    ['Executar a ordem após alertar o cliente sobre a inadequação e obter sua declaração expressa de ciência', 'Executar a ordem sem nenhum registro, pois a iniciativa foi do cliente', 'Recusar a ordem em qualquer hipótese', 'Alterar o perfil para agressivo sem novo questionário'],
    'Pela norma da CVM sobre suitability, o cliente pode aplicar fora do perfil desde que seja alertado da inadequação e declare expressamente que está ciente.'),
  sq('ex-set-cpr-m1-2', 'CPRO_R', 'EX-CPR-M1', 2, '4.8', 'Desvio padrão da carteira e o benefício da diversificação', 'Média',
    'Concentrar 80% da carteira em um único fundo de ações aumenta principalmente:',
    ['A exposição a riscos que a diversificação reduziria', 'A liquidez da carteira', 'A garantia de retorno, pelo histórico recente', 'A proteção contra a queda da bolsa'],
    'A diversificação reduz o risco não sistemático. Concentrar elimina esse benefício; retorno passado não garante retorno futuro.'),
  sq('ex-set-cpr-m2-1', 'CPRO_R', 'EX-CPR-M2', 1, '4.2', 'Planejamento de investimentos para eventos ou novos objetivos', 'Média',
    'Qual é o principal risco de aplicar a entrada do imóvel no Tesouro IPCA+ 2045?',
    ['Perda por marcação a mercado se os juros subirem antes da data do resgate', 'Falta de remuneração pela inflação', 'Ausência de liquidez, pois o título não pode ser vendido antes de 2045', 'Risco de crédito maior que o de um banco médio'],
    'O título pode ser vendido antes do vencimento, mas pelo preço de mercado. Por ser longo, uma alta de juros reduz bastante o preço.'),
  sq('ex-set-cpr-m2-2', 'CPRO_R', 'EX-CPR-M2', 2, '4.2', 'Planejamento de investimentos para eventos ou novos objetivos', 'Baixa',
    'Qual característica deve ter prioridade na escolha do investimento para esse objetivo?',
    ['Liquidez compatível com a data e baixa volatilidade', 'A maior taxa nominal disponível', 'Isenção de IR, mesmo com carência maior que 8 meses', 'Exposição à valorização do setor imobiliário'],
    'Com data certa e próxima, o que importa é ter o valor disponível na data. Taxa alta com volatilidade ou carência longa põe o objetivo em risco.'),
  sq('ex-set-cpr-c1-1', 'CPRO_R', 'EX-CPR-C1', 1, '4.1', 'Boas práticas de rebalanceamento da carteira', 'Média',
    'Para voltar à alocação-alvo, qual movimento Carlos deve fazer?',
    ['Vender R$ 50.000 em ações e aplicar em renda fixa', 'Vender R$ 100.000 em ações e aplicar em renda fixa', 'Vender R$ 50.000 em renda fixa e comprar ações', 'Não fazer nada, pois o desvio está dentro da banda'],
    'Alvo em ações: 40% × R$ 500.000 = R$ 200.000. Hoje há R$ 250.000 (50%), desvio de 10 p.p., acima da banda de 5 p.p. É preciso transferir R$ 50.000 para renda fixa.'),
  sq('ex-set-cpr-c1-2', 'CPRO_R', 'EX-CPR-C1', 2, '4.4', 'Tributação e impacto no rebalanceamento de carteiras', 'Alta',
    'Sobre a venda de ações no rebalanceamento, é correto afirmar:',
    ['Há IR de 15% sobre o ganho, porque as vendas no mês superam R$ 20.000', 'É isenta, pois o rebalanceamento não é tributado', 'Há IR de 20% sobre o valor total vendido', 'É isenta, porque o lucro é menor que R$ 20.000'],
    'Para pessoa física, a isenção em operações comuns vale quando o total de VENDAS de ações no mês não passa de R$ 20.000. Com R$ 50.000 vendidos, o ganho é tributado a 15%.'),
  sq('ex-set-cpr-c2-1', 'CPRO_R', 'EX-CPR-C2', 1, '4.8', 'Desvio padrão da carteira e o benefício da diversificação', 'Média',
    'Pelo índice de Sharpe, qual fundo teve o melhor retorno ajustado ao risco?',
    ['Alfa, com Sharpe de 0,50', 'Beta, com Sharpe de 0,42', 'Beta, por ter o maior retorno médio', 'Os dois empatam, pois ambos superaram o CDI'],
    'Sharpe = (retorno − livre de risco) ÷ desvio-padrão. Alfa: (14 − 10) ÷ 8 = 0,50. Beta: (15 − 10) ÷ 12 ≈ 0,42.'),
  sq('ex-set-cpr-c2-2', 'CPRO_R', 'EX-CPR-C2', 2, '4.8', 'Desvio padrão da carteira e o benefício da diversificação', 'Baixa',
    'O desvio-padrão da tabela representa:',
    ['A volatilidade dos retornos em torno da média', 'O retorno mínimo garantido do fundo', 'A taxa de administração cobrada', 'O retorno acima do CDI'],
    'O desvio-padrão mede quanto os retornos variam em torno da média: quanto maior, maior a volatilidade.'),

  // C-Pro I
  sq('ex-set-cpi-c1-1', 'CPRO_I', 'EX-CPI-C1', 1, '4.1', 'Risco, retorno e mercado', 'Média',
    'Se as taxas de juros subirem 1 ponto percentual, qual a variação aproximada do preço do Título 2?',
    ['Queda de cerca de 3,6%', 'Alta de cerca de 3,6%', 'Queda de cerca de 10%', 'Nenhuma, pois o título paga cupom'],
    'Variação ≈ −3,6 × 1% = −3,6%. Juros e preço de título prefixado andam em sentidos opostos.'),
  sq('ex-set-cpi-c1-2', 'CPRO_I', 'EX-CPI-C1', 2, '4.1', 'Risco, retorno e mercado', 'Baixa',
    'Qual título é o mais sensível a variações na taxa de juros?',
    ['Título 3, por ter a maior duration', 'Título 1, por não pagar cupom', 'Título 2, por pagar cupom de 10%', 'Todos têm a mesma sensibilidade'],
    'Quanto maior a duration, maior a sensibilidade do preço à taxa. O Título 3 é longo e sem cupom, com duration modificada de 7,1.'),
  sq('ex-set-cpi-c2-1', 'CPRO_I', 'EX-CPI-C2', 1, '3.4', 'PGBL', 'Média',
    'Qual o valor máximo das contribuições ao PGBL que Fernanda pode deduzir da base do IR no ano?',
    ['R$ 24.000', 'R$ 30.000', 'R$ 20.000', 'R$ 12.000'],
    'A dedução é limitada a 12% da renda bruta tributável: 12% × R$ 200.000 = R$ 24.000. Os R$ 6.000 restantes não reduzem a base neste ano.'),
  sq('ex-set-cpi-c2-2', 'CPRO_I', 'EX-CPI-C2', 2, '1.5', 'Tributação', 'Média',
    'No resgate do PGBL, sobre qual base incide o IR?',
    ['Sobre o valor total resgatado (contribuições e rendimentos)', 'Apenas sobre os rendimentos', 'Apenas sobre as contribuições que não foram deduzidas', 'Não há IR no resgate do PGBL'],
    'Como as contribuições do PGBL foram deduzidas na declaração, o IR no resgate incide sobre o valor total. No VGBL, incide só sobre os rendimentos.'),
];
