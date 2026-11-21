import type { Cert } from '../types';

/**
 * Pesos por tema para o plano de estudos (multiplicador; 1 = peso normal).
 *
 * VAZIO DE PROPÓSITO: os documentos públicos da Anbima que consultei (Guia de elaboração,
 * "Nosso jeito de avaliar" e relatório do exame-piloto) NÃO informam o peso nem o nº de
 * questões por macrotema. Eles só listam os macrotemas:
 *   CPA:     Estrutura e dinâmica do SFN · Produtos do mercado financeiro ·
 *            Relacionamento com o cliente · Inovação e desenvolvimento de mercado
 *   C-Pro R: Prospecção e relacionamento · Análise de informações do cliente ·
 *            Indicação de investimentos · Análise de portfólio e monitoramento da carteira
 * Os números estão na "Matriz de Avaliação completa" (link no Guia). Quando tiver os valores,
 * preencha aqui com o nome EXATO do tema usado nas questões, por exemplo:
 *   CPA: { 'Produtos do mercado financeiro': 1.4 }
 * Não invente valores: tema ausente = peso 1.
 */
export const TOPIC_WEIGHTS: Record<Cert, Record<string, number>> = {
  CPA: {},
  CPRO_R: {},
};
