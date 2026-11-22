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
    code: 'EX-CPA-M2', cert: 'CPA', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '2.2.1',
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
          client: 'Não pretendo mudar. E o regime de tributação, preciso escolher agora?',
          options: [
            'Não precisa: desde 2024 você pode escolher entre progressivo e regressivo até o primeiro resgate ou o início da renda.',
            'Precisa, e depois da contratação não há como mudar a escolha.',
            'Precisa, e o regressivo é obrigatório para planos com prazo acima de 10 anos.',
            'Não precisa, porque o regime é definido pela seguradora conforme o prazo.',
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
    code: 'EX-CPR-M1', cert: 'CPRO_R', kind: 'mapa', year: 2026, source: 'exemplo', pdCode: '1.6.2',
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
    code: 'EX-CPR-C2', cert: 'CPRO_R', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '4.9',
    topic: 'Relação entre risco, retorno e dominância entre carteiras', title: 'Retorno e risco de dois fundos',
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
    code: 'EX-CPI-C1', cert: 'CPRO_I', kind: 'caso', year: 2026, source: 'exemplo', pdCode: '4.9.2',
    topic: 'Administração e gerenciamento de risco', title: 'Sensibilidade de títulos à taxa de juros',
    body: {
      html: `<p>Um gestor analisa três títulos prefixados para a carteira de um cliente:</p>
<table>
<thead><tr><th scope="col">Título</th><th scope="col">Cupom</th><th scope="col">Vencimento</th><th scope="col">Duration modificada</th></tr></thead>
<tbody>
<tr><td>Título 1</td><td>Sem cupom</td><td>2 anos</td><td>1,8</td></tr>
<tr><td>Título 2</td><td>10% ao ano</td><td>5 anos</td><td>3,7</td></tr>
<tr><td>Título 3</td><td>Sem cupom</td><td>8 anos</td><td>7,1</td></tr>
</tbody>
</table>
<p>As taxas dos títulos seguem a curva de juros (mais altas nos prazos longos). Use a aproximação: variação do preço ≈ − duration modificada × variação da taxa.</p>`,
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
    ['Entender o objetivo do recurso e o perfil atual da cliente', 'Executar a compra de ações, pois foi o pedido da cliente', 'Recusar a operação e encerrar o atendimento', 'Recomendar ações de empresas boas pagadoras de dividendos'],
    'A) Correta. O suitability exige conhecer objetivo, situação financeira e tolerância a risco antes de recomendar (Resolução CVM 30). B) Incorreta. O pedido da cliente não dispensa a verificação de adequação ao perfil. C) Incorreta. Recusar sem orientar não atende a cliente; o caminho é entender o objetivo e orientar. D) Incorreta. Recomendar um tipo de ação antes de conhecer o objetivo e o perfil inverte a ordem do suitability.'),
  sq('ex-set-cpa-m1-2', 'CPA', 'EX-CPA-M1', 2, '2.1.1', 'Instrumentos de renda variável e renda fixa', 'Baixa',
    'Para a reserva de emergência de Marta, qual aplicação é mais adequada?',
    ['Tesouro Selic com liquidez diária', 'Ações de uma única empresa', 'Tesouro IPCA+ com vencimento em 20 anos', 'Fundo de ações com resgate em D+30'],
    'A) Correta. Reserva de emergência pede liquidez e baixa oscilação de preço; o Tesouro Selic é pós-fixado e pode ser resgatado em dia útil. B) Incorreta. Ações oscilam e podem estar em queda justamente quando o dinheiro for necessário. C) Incorreta. Antes do vencimento, o IPCA+ longo sofre marcação a mercado e pode ser vendido com perda. D) Incorreta. Além de oscilar, o fundo de ações só paga o resgate 30 dias depois do pedido.'),
  sq('ex-set-cpa-m2-1', 'CPA', 'EX-CPA-M2', 1, '2.2.1', 'Regimes de tributação (progressivo e regressivo)', 'Média',
    'Considerando que Roberto declara no modelo simplificado, o plano adequado ao caso dele é o:',
    ['VGBL, porque ele não aproveitaria a dedução das contribuições do PGBL', 'PGBL, porque a dedução de 12% vale também no modelo simplificado', 'PGBL, porque o IR no resgate incide só sobre os rendimentos', 'PGBL, porque a dedução vale para quem tem renda acima da faixa de isenção'],
    'A) Correta. A dedução de até 12% da renda bruta tributável vale só para quem declara no modelo completo (Lei 9.532/1997, art. 11); no VGBL, o IR incide apenas sobre os rendimentos. B) Incorreta. No modelo simplificado não há dedução das contribuições ao PGBL. C) Incorreta. No PGBL, o IR no resgate incide sobre o valor total; a base só com rendimentos é a do VGBL. D) Incorreta. Ter renda acima da faixa de isenção não basta; é preciso declarar no modelo completo.'),
  sq('ex-set-cpa-m2-2', 'CPA', 'EX-CPA-M2', 2, '2.2.2', 'Regimes de tributação (progressivo e regressivo)', 'Média',
    'Sobre a escolha do regime de tributação do plano de Roberto, a orientação correta é que ele:',
    ['Pode adiar a escolha entre progressivo e regressivo até o primeiro resgate ou o início da renda', 'Precisa escolher o regime na contratação, sem possibilidade de alteração depois', 'Deve optar pelo progressivo, que tem alíquota fixa de 10% no resgate', 'Deve optar pelo regressivo, obrigatório para planos com prazo acima de dez anos'],
    'A) Correta. Desde a Lei 14.803/2024, a opção entre os regimes pode ser feita até o pedido do benefício ou o primeiro resgate; assim Roberto decide quando conhecer melhor sua renda futura. B) Incorreta. A escolha na contratação era a regra anterior; hoje ela pode ser adiada. C) Incorreta. No progressivo há retenção de 15% nos resgates e ajuste pela tabela do IR na declaração; não há alíquota fixa de 10%. D) Incorreta. O regressivo (35% caindo até 10% após 10 anos, Lei 11.053/2004) é uma opção, não uma obrigação.'),
  sq('ex-set-cpa-c1-1', 'CPA', 'EX-CPA-C1', 1, '2.1.1.1.11', 'Instrumentos de renda variável e renda fixa', 'Média',
    'Qual opção oferece a maior rentabilidade líquida anual aproximada para Ana?',
    ['LCI, com 10,5% ao ano líquidos', 'CDB, com 12,0% ao ano líquidos', 'CDB, com cerca de 10,8% ao ano líquidos', 'CDB, com cerca de 10,2% ao ano líquidos'],
    'Acima de 720 dias, a alíquota é 15% (Lei 11.033/2004). A) Correta. A LCI é isenta para pessoa física: 10,5% ao ano, a maior das três. B) Incorreta. 12,0% é a taxa bruta do CDB, antes do IR. C) Incorreta. 10,8% aplica alíquota de 10%, que não existe na tabela da renda fixa. D) Incorreta. O CDB rende cerca de 10,2% líquidos (12,0% × 0,85), menos que a LCI; o Tesouro, perto de 9,8%.'),
  sq('ex-set-cpa-c1-2', 'CPA', 'EX-CPA-C1', 2, '2.1.1', 'Instrumentos de renda variável e renda fixa', 'Média',
    'Ana pergunta quais das três opções contam com a garantia do FGC. A resposta adequada do gerente é:',
    ['CDB e LCI, mas não o Tesouro, que tem risco soberano', 'Só o CDB, pois a LCI tem lastro imobiliário', 'CDB e LCI, se mantidos até o vencimento', 'As três, inclusive o Tesouro Prefixado'],
    'A) Correta. CDB e LCI são cobertos pelo FGC até R$ 250 mil por CPF por instituição ou conglomerado, com teto de R$ 1 milhão a cada quatro anos; título público tem risco soberano e não conta com o FGC. B) Incorreta. O lastro imobiliário não retira a LCI da cobertura do FGC. C) Incorreta. A garantia não depende de manter o título até o vencimento. D) Incorreta. Títulos públicos não são cobertos pelo FGC.'),

  // C-Pro R
  sq('ex-set-cpr-m1-1', 'CPRO_R', 'EX-CPR-M1', 1, '1.6.2', 'Regras para o relacionamento e distribuição de produtos', 'Média',
    'Se Paulo insistir em uma aplicação inadequada ao seu perfil, o que a regulação de suitability permite?',
    ['Executar após alertar sobre a inadequação e obter a ciência expressa', 'Executar sem registro, pois a iniciativa foi do cliente', 'Recusar a ordem até um novo questionário de perfil', 'Alterar o perfil para agressivo sem novo questionário'],
    'A) Correta. Pela Resolução CVM 30, o cliente pode aplicar fora do perfil se for alertado da inadequação e declarar expressamente que está ciente. B) Incorreta. A iniciativa do cliente não dispensa o alerta e o registro da ciência. C) Incorreta. A norma não exige novo questionário para executar a ordem; exige o alerta e a declaração. D) Incorreta. Alterar o perfil sem nova análise desvirtua o suitability.'),
  sq('ex-set-cpr-m1-2', 'CPRO_R', 'EX-CPR-M1', 2, '4.8', 'Desvio padrão da carteira e o benefício da diversificação', 'Média',
    'Ao concentrar 80% da carteira em um único fundo de ações, Paulo amplia a exposição da carteira ao:',
    ['Risco de mercado de ações', 'Risco de crédito dos emissores', 'Risco de taxa de juros', 'Risco cambial da carteira'],
    'A) Correta. Um fundo de ações já é diversificado entre papéis; concentrar 80% nele aumenta a exposição à classe de ações (risco de mercado) e a volatilidade da carteira. B) Incorreta. Fundos de ações têm pouca exposição a risco de crédito. C) Incorreta. Reduzir a renda fixa diminui, e não amplia, a exposição a juros dos títulos. D) Incorreta. O caso não indica exposição a moeda estrangeira.'),
  sq('ex-set-cpr-m2-1', 'CPRO_R', 'EX-CPR-M2', 1, '4.2', 'Planejamento de investimentos para eventos ou novos objetivos', 'Média',
    'Qual é o principal risco de aplicar a entrada do imóvel no Tesouro IPCA+ 2045?',
    ['Perda por marcação a mercado se os juros subirem', 'Falta de correção do valor pela inflação', 'Impossibilidade de vender o título antes de 2045', 'Risco de crédito maior que o de um banco médio'],
    'A) Correta. O título pode ser vendido antes do vencimento, mas pelo preço de mercado; por ser longo, uma alta de juros reduz bastante o preço na data da compra do imóvel. B) Incorreta. O IPCA+ corrige o valor pela inflação. C) Incorreta. O Tesouro Direto permite vender o título antes do vencimento. D) Incorreta. O risco de crédito do Tesouro Nacional é o mais baixo da economia.'),
  sq('ex-set-cpr-m2-2', 'CPRO_R', 'EX-CPR-M2', 2, '4.2', 'Planejamento de investimentos para eventos ou novos objetivos', 'Média',
    'Para o objetivo de Juliana, a característica que deve ter prioridade na escolha do investimento é:',
    ['Liquidez na data e baixa volatilidade', 'A maior taxa nominal disponível', 'Isenção de IR, mesmo com carência longa', 'Exposição ao setor imobiliário'],
    'A) Correta. Com data certa e próxima, o que importa é ter o valor disponível na data, sem oscilação. B) Incorreta. Taxa alta com volatilidade ou prazo longo põe o objetivo em risco. C) Incorreta. Uma carência maior que 8 meses impede o uso do dinheiro na compra. D) Incorreta. Investir no setor não protege o valor da entrada e acrescenta risco de mercado.'),
  sq('ex-set-cpr-c1-1', 'CPRO_R', 'EX-CPR-C1', 1, '4.1.3.4', 'Boas práticas de rebalanceamento da carteira', 'Média',
    'Para voltar à alocação-alvo, qual movimento Carlos deve fazer?',
    ['Vender R$ 50.000 em ações e aplicar em renda fixa', 'Vender R$ 100.000 em ações e aplicar em renda fixa', 'Vender R$ 50.000 em renda fixa e comprar ações', 'Não fazer nada, pois o desvio está dentro da banda'],
    'Alvo em ações: 40% × R$ 500.000 = R$ 200.000; hoje há R$ 250.000 (50%). A) Correta. O desvio é de 10 pontos, acima da banda de 5: é preciso transferir R$ 50.000 de ações para renda fixa. B) Incorreta. Vender R$ 100.000 levaria as ações a 30%, abaixo do alvo. C) Incorreta. Inverte o movimento: aumentaria ainda mais a parcela em ações. D) Incorreta. O desvio de 10 pontos passa da banda de 5.'),
  sq('ex-set-cpr-c1-2', 'CPRO_R', 'EX-CPR-C1', 2, '4.4', 'Tributação e impacto no rebalanceamento de carteiras', 'Alta',
    'Sobre a venda das ações no rebalanceamento, a orientação correta a Carlos é que:',
    ['Há IR de 15% sobre o ganho, pelas vendas acima de R$ 20 mil', 'É isenta, pois o rebalanceamento não é tributado', 'Há IR de 20% sobre o valor total vendido', 'É isenta, pois o lucro obtido é menor que R$ 20 mil'],
    'A) Correta. Para pessoa física, a isenção em operações comuns vale quando o total de vendas de ações no mês não passa de R$ 20 mil (Lei 11.033/2004, art. 3º); com R$ 50 mil vendidos, o ganho é tributado a 15%. B) Incorreta. Não há regra que isente a venda por ser rebalanceamento. C) Incorreta. O imposto incide sobre o ganho, não sobre o valor vendido, e a alíquota de 20% é a do day trade. D) Incorreta. O limite de R$ 20 mil se refere ao total vendido no mês, não ao lucro.'),
  sq('ex-set-cpr-c2-1', 'CPRO_R', 'EX-CPR-C2', 1, '4.9.5', 'Relação entre risco, retorno e dominância entre carteiras', 'Média',
    'Pelo índice de Sharpe, qual fundo teve o melhor retorno ajustado ao risco?',
    ['Alfa, com Sharpe de 0,50', 'Beta, com Sharpe de 0,42', 'Alfa, com Sharpe de 1,75', 'Beta, porque o retorno acima do CDI é maior'],
    'Sharpe = (retorno − taxa livre de risco) ÷ desvio-padrão. A) Correta. Alfa: (14 − 10) ÷ 8 = 0,50, maior que o de Beta. B) Incorreta. O cálculo de Beta está certo (≈ 0,42), mas é menor que o de Alfa. C) Incorreta. 1,75 é 14 ÷ 8: divide o retorno total, sem descontar o CDI. D) Incorreta. Olhar só o excesso de retorno (5 contra 4 pontos) ignora o risco, que é o que o Sharpe ajusta.'),
  sq('ex-set-cpr-c2-2', 'CPRO_R', 'EX-CPR-C2', 2, '4.8', 'Desvio padrão da carteira e o benefício da diversificação', 'Baixa',
    'O desvio-padrão da tabela representa:',
    ['A volatilidade dos retornos em torno da média', 'A perda máxima esperada do fundo em um ano', 'O retorno médio obtido acima do CDI', 'A correlação dos retornos do fundo com o CDI'],
    'A) Correta. O desvio-padrão mede quanto os retornos variam em torno da média: quanto maior, maior a volatilidade. B) Incorreta. A perda máxima esperada com dada confiança é o VaR, outra medida. C) Incorreta. O retorno acima do CDI é o excesso de retorno, numerador do Sharpe. D) Incorreta. A correlação mede como dois retornos se movem juntos, não a dispersão de um deles.'),

  // C-Pro I
  sq('ex-set-cpi-c1-1', 'CPRO_I', 'EX-CPI-C1', 1, '4.9.2', 'Administração e gerenciamento de risco', 'Média',
    'Se as taxas de juros subirem 1 ponto percentual, qual a variação aproximada do preço do Título 2?',
    ['Queda de cerca de 3,7%', 'Alta de cerca de 3,7%', 'Queda de cerca de 10%', 'Queda de cerca de 5%'],
    'A) Correta. Variação ≈ −3,7 × 1% = −3,7%: juros e preço de título prefixado andam em sentidos opostos. B) Incorreta. O sinal está trocado: a alta dos juros derruba o preço. C) Incorreta. 10% é o cupom do título, não a sua sensibilidade à taxa. D) Incorreta. 5% usa o prazo até o vencimento; com cupons, a duration é menor que o prazo.'),
  sq('ex-set-cpi-c1-2', 'CPRO_I', 'EX-CPI-C1', 2, '4.9.2', 'Administração e gerenciamento de risco', 'Baixa',
    'Qual título é o mais sensível a variações na taxa de juros?',
    ['Título 3, por ter a maior duration', 'Título 1, por não pagar cupom', 'Título 2, por pagar o maior cupom', 'Título 1, por ter o menor prazo até o vencimento'],
    'A) Correta. Quanto maior a duration, maior a sensibilidade do preço à taxa; o Título 3, longo e sem cupom, tem duration modificada de 7,1. B) Incorreta. Não pagar cupom aumenta a duration, mas o Título 1 é curto (1,8). C) Incorreta. Cupom maior reduz a duration, e não aumenta a sensibilidade. D) Incorreta. Prazo curto torna o título menos sensível, não mais.'),
  sq('ex-set-cpi-c2-1', 'CPRO_I', 'EX-CPI-C2', 1, '3.4.4', 'PGBL', 'Média',
    'Qual o valor máximo das contribuições ao PGBL que Fernanda pode deduzir da base do IR no ano?',
    ['R$ 24.000', 'R$ 30.000', 'R$ 20.000', 'R$ 6.000'],
    'A) Correta. A dedução é limitada a 12% da renda bruta tributável: 12% × R$ 200.000 = R$ 24.000 (Lei 9.532/1997, art. 11). B) Incorreta. R$ 30.000 é a contribuição pretendida, que passa do limite. C) Incorreta. R$ 20.000 aplica 10%, e o limite é de 12%. D) Incorreta. R$ 6.000 é a parte que excede o limite e não pode ser deduzida.'),
  sq('ex-set-cpi-c2-2', 'CPRO_I', 'EX-CPI-C2', 2, '3.4.3', 'PGBL', 'Média',
    'No resgate do PGBL, sobre qual base incide o IR?',
    ['Sobre o valor total resgatado', 'Apenas sobre os rendimentos', 'Sobre o total, menos as contribuições não deduzidas', 'Sobre o total, descontada a taxa de carregamento'],
    'A) Correta. No PGBL, o IR do resgate incide sobre o valor total resgatado (Lei 9.250/1995, art. 33), inclusive sobre a parte das contribuições que passou do limite de 12% e não foi deduzida; por isso não convém contribuir ao PGBL acima do limite: o excedente fica melhor num VGBL. B) Incorreta. A base só com os rendimentos é a regra do VGBL. C) Incorreta. A lei não exclui da base as contribuições que não foram deduzidas. D) Incorreta. A taxa de carregamento não altera a base de cálculo do resgate.'),
];
