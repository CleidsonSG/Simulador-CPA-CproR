import { describe, expect, it } from 'vitest';
import { gerenteLine, missingFigures, sanitizeHtml, typingDelay, walkMap } from './scenario';
import type { MapBody } from '../types';
import { SAMPLE_SCENARIOS } from '../data/sampleScenarios';

const body: MapBody = {
  intro: 'Intro',
  pergunta: 'Como responde?',
  rootKey: 'a',
  nodes: {
    a: { client: 'Oi', options: ['1', '2', '3', '4'], next: [{ child: 'b' }, { child: 'c', gerente: 'Fala longa do gerente' }, { child: 'x' }, {}] },
    b: { client: 'Ramo B', options: ['1', '2', '3', '4'], next: [{ child: 'a' }, {}, {}, {}] },
    c: { client: 'Fim C', options: [], next: [], end: true, endText: 'Acabou' },
  },
};

describe('mapa de decisão', () => {
  it('começa no nó raiz aguardando a resposta', () => {
    const w = walkMap(body, []);
    expect(w.ended).toBe(false);
    expect(w.steps.map((s) => s.key)).toEqual(['a']);
  });
  it('segue o ramo escolhido e termina em nó sem opções', () => {
    const w = walkMap(body, [1]);
    expect(w.steps.map((s) => s.key)).toEqual(['a', 'c']);
    expect(w.ended).toBe(true);
  });
  it('voltar = remover a última escolha', () => {
    const path = [0];
    expect(walkMap(body, path).steps).toHaveLength(2);
    expect(walkMap(body, path.slice(0, -1)).steps).toHaveLength(1);
  });
  it('escolha sem nó seguinte ou com nó inexistente encerra', () => {
    expect(walkMap(body, [3]).ended).toBe(true);
    expect(walkMap(body, [2]).ended).toBe(true);
  });
  it('protege contra ciclos', () => {
    const w = walkMap(body, [0, 0, 0, 0]);
    expect(w.ended).toBe(true);
    expect(w.steps.map((s) => s.key)).toEqual(['a', 'b']);
  });
  it('fala do gerente: a do mapa ou o texto da opção', () => {
    expect(gerenteLine(body.nodes.a, 1)).toBe('Fala longa do gerente');
    expect(gerenteLine(body.nodes.a, 0)).toBe('1');
  });
  it('atraso de digitação proporcional, com limites, e zero com movimento reduzido', () => {
    expect(typingDelay('oi')).toBe(600);
    expect(typingDelay('x'.repeat(1000))).toBe(1800);
    expect(typingDelay('x'.repeat(40))).toBeGreaterThan(600);
    expect(typingDelay('qualquer', true)).toBe(0);
  });
  it('os mapas de exemplo sempre chegam ao fim em 2 respostas', () => {
    for (const s of SAMPLE_SCENARIOS) {
      if (s.kind !== 'mapa') continue;
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++) {
          const w = walkMap(s.body, [a, b]);
          expect(w.ended).toBe(true);
          expect(w.steps[w.steps.length - 1]?.node.endText).toBeTruthy();
        }
    }
  });
});

describe('sanitizeHtml (texto-base do caso)', () => {
  it('mantém texto e tabelas', () => {
    const html = '<p>Olá <b>mundo</b></p><table><tr><th scope="col">A</th><td colspan="2">1</td></tr></table>';
    expect(sanitizeHtml(html)).toBe(html);
  });
  it('remove scripts, eventos, estilos, links e imagens', () => {
    const out = sanitizeHtml('<p onclick="x()" style="color:red">a</p><script>alert(1)</script><a href="javascript:x">b</a><img src=x onerror=alert(1)><iframe src="//e"></iframe>');
    expect(out).toBe('<p>a</p>b');
  });
  it('só aceita valores seguros nos atributos permitidos', () => {
    expect(sanitizeHtml('<td colspan="2 onclick=x" scope="evil">x</td>')).toBe('<td>x</td>');
  });
  it('escapa sinais soltos e preserva entidades', () => {
    expect(sanitizeHtml('a < b &amp; c > d & e')).toBe('a &lt; b &amp; c &gt; d &amp; e');
  });
  it('remove comentários e tags maiúsculas perigosas', () => {
    expect(sanitizeHtml('<!-- x --><SCRIPT>bad()</SCRIPT><P>ok</P>')).toBe('<p>ok</p>');
  });
});

describe('gráficos ausentes no texto do caso', () => {
  const P = 'https://abc.supabase.co/storage/v1/object/public/';
  it('conta imagens descartadas (links externos que expiram)', () => {
    expect(missingFigures('<p>x</p><img src="https://portal.exemplo/g1.png?exp=1"><img src="https://portal.exemplo/g2.png">', P)).toBe(2);
  });
  it('conta "Gráfico N" citados quando não há nenhuma imagem válida', () => {
    expect(missingFigures('<p>Carga tributária (Gráfico 2) e CDS (Gráfico 3); ver Gráfico 2.</p>', P)).toBe(2);
  });
  it('não avisa quando as imagens estão no Storage do projeto', () => {
    expect(missingFigures(`<p>Ver Gráfico 1</p><img src="${P}casos/g1.png">`, P)).toBe(0);
  });
  it('texto sem gráficos: sem aviso', () => {
    expect(missingFigures('<table><tr><td>1</td></tr></table>', P)).toBe(0);
  });
});
