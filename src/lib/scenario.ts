import type { MapBody, MapNode } from '../types';

/* ───────────── Caso: HTML do texto-base ───────────── */

const ALLOWED = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'small', 'span', 'div',
  'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
]);
const VOID = new Set(['br', 'hr', 'col']);
const ATTRS = new Set(['colspan', 'rowspan', 'scope']);

const escapeText = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Deixa passar só marcação de texto e tabelas, sem nenhum atributo além de colspan/rowspan/scope
 * (valores restritos). Scripts, estilos, links, imagens, eventos e comentários são removidos.
 * O conteúdo do caso vem do banco: nunca vai para a tela sem passar por aqui.
 */
export function sanitizeHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
  let out = '';
  let last = 0;
  const tag = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  for (let m = tag.exec(cleaned); m; m = tag.exec(cleaned)) {
    out += escapeText(cleaned.slice(last, m.index));
    last = tag.lastIndex;
    const name = m[1].toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (m[0].startsWith('</')) {
      if (!VOID.has(name)) out += `</${name}>`;
      continue;
    }
    let attrs = '';
    const attr = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    for (let a = attr.exec(m[2]); a; a = attr.exec(m[2])) {
      const key = a[1].toLowerCase();
      const val = (a[2] ?? a[3] ?? a[4] ?? '').trim();
      if (!ATTRS.has(key)) continue;
      if (key === 'scope' ? /^(row|col|rowgroup|colgroup)$/.test(val) : /^\d{1,2}$/.test(val)) attrs += ` ${key}="${val}"`;
    }
    out += `<${name}${attrs}>`;
  }
  return out + escapeText(cleaned.slice(last));
}

/* ───────────── Mapa de decisão ───────────── */

export interface MapStep {
  key: string;
  node: MapNode;
  /** Opção escolhida pelo gerente neste nó (undefined = ainda não respondeu). */
  choice?: number;
}

/** Nó seguinte ao escolher `choice` em `node` (null quando a conversa termina). */
export function nextKey(map: MapBody, node: MapNode, choice: number): string | null {
  if (node.end) return null;
  const child = node.next[choice]?.child;
  return child && map.nodes[child] ? child : null;
}

/** Fala do gerente para a escolha: a do mapa, ou o próprio texto da opção. */
export function gerenteLine(node: MapNode, choice: number): string {
  return node.next[choice]?.gerente?.trim() || node.options[choice] || '';
}

/**
 * Reconstrói a conversa a partir das escolhas feitas (path[i] = opção escolhida no i-ésimo nó).
 * Nó com `end`, escolha sem nó seguinte ou nó inexistente encerram a conversa. Protege contra ciclos.
 */
export function walkMap(map: MapBody, path: readonly number[]): { steps: MapStep[]; ended: boolean } {
  const steps: MapStep[] = [];
  let key: string | null = map.nodes[map.rootKey] ? map.rootKey : null;
  const visited = new Set<string>();
  for (let i = 0; key && !visited.has(key); i++) {
    visited.add(key);
    const node: MapNode = map.nodes[key];
    const choice = path[i];
    steps.push({ key, node, choice });
    // Nó sem opções encerra; nó com opções pede a resposta do gerente antes (mesmo se for o último).
    if (node.options.length === 0) return { steps, ended: true };
    if (choice === undefined) return { steps, ended: false };
    key = nextKey(map, node, choice);
  }
  return { steps, ended: true };
}

/** Atraso de "digitando…" do cliente: proporcional ao tamanho da fala, entre 0,6 s e 1,8 s. */
export function typingDelay(text: string, reduced = false): number {
  if (reduced) return 0;
  return Math.round(Math.min(1800, Math.max(600, 300 + text.length * 18)));
}
