/**
 * richText — parser puro do markdown-leve que os autores JÁ escrevem.
 *
 * Levantamento em produção (2026-07-31): das 47 activities `concept`, 25 usam
 * `**negrito**`, 12 usam crase e 9 usam bloco cercado — e o InstructionPanel
 * jogava tudo num <p> só, então o aluno lia os asteriscos e as crases na tela.
 * O parser não adivinha nada: só reconhece delimitador explícito. Texto sem
 * marcação nenhuma sai como um parágrafo por bloco, igual ao que já saía.
 *
 * Escopo deliberadamente fechado (sem HTML embutido, sem link, sem tabela):
 * conteúdo de aula é dado do banco, e cada construção a mais é superfície de
 * injeção e de dívida de renderer.
 */
import { parseInline, type Inline } from './richTextInline.js';

export { parseInline };
export type { Inline };

export type Block =
  | { type: 'heading'; level: 2 | 3; spans: Inline[] }
  | { type: 'paragraph'; spans: Inline[] }
  | { type: 'quote'; spans: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'code'; language: string; value: string };

const HEADING = /^(#{2,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
const ORDERED = /^(\d+)[.)]\s+(.*)$/;
const FENCE = /^```(.*)$/;
const RULE = /^-{3,}$/;
const THINK_FIRST = /^\?[>=]\s?(.*)$/;

/**
 * Texto cru → blocos. Linha em branco separa parágrafo; a quebra simples é
 * PRESERVADA no texto do parágrafo (o `<p>` a honra com `whitespace-pre-line`).
 *
 * Markdown normal juntaria as linhas com espaço. Aqui não, porque nos 47
 * concepts de produção nenhum parágrafo é quebrado a 80 colunas — a linha mais
 * longa tem 119 caracteres. Toda quebra que existe é o autor escrevendo um item
 * por linha, e juntar tudo é exatamente o muro de texto que se quer evitar.
 */
export function parseRichText(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', spans: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = trimmed.match(FENCE);
    if (fence) {
      flush();
      const language = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      const value = body.join('\n');
      if (value.trim()) blocks.push({ type: 'code', language, value });
      continue;
    }

    if (trimmed === '') {
      flush();
      continue;
    }

    // Rastro da paginação por passos, aposentada em 2026-07-31: uma linha só de
    // hífens é engolida em vez de virar o texto cru `---` na tela do aluno.
    if (RULE.test(trimmed)) {
      flush();
      continue;
    }

    // Mesmo motivo: `?>`/`?=` marcavam o pense-antes, que virou o kind
    // `concept_reveal`. Aqui só o prefixo cai — o texto vira parágrafo normal,
    // então a pergunta e a resposta continuam legíveis até a migração de
    // conteúdo converter essas telas.
    const thinkFirst = trimmed.match(THINK_FIRST);
    if (thinkFirst) {
      flush();
      const text = thinkFirst[1].trim();
      if (text) blocks.push({ type: 'paragraph', spans: parseInline(text) });
      continue;
    }

    const heading = trimmed.match(HEADING);
    if (heading) {
      flush();
      blocks.push({
        type: 'heading',
        level: heading[1].length === 2 ? 2 : 3,
        spans: parseInline(heading[2]),
      });
      continue;
    }

    const quote = trimmed.match(QUOTE);
    if (quote) {
      flush();
      if (quote[1].trim()) blocks.push({ type: 'quote', spans: parseInline(quote[1]) });
      continue;
    }

    const bullet = trimmed.match(BULLET);
    const ordered = trimmed.match(ORDERED);
    if (bullet || ordered) {
      flush();
      const item = ordered ? ordered[2] : bullet![1];
      const previous = blocks[blocks.length - 1];
      if (previous?.type === 'list' && previous.ordered === Boolean(ordered)) {
        previous.items.push(parseInline(item));
      } else {
        // `start` vem do primeiro item porque a numeração é do autor: sem ele um
        // "7. Salve o arquivo" apareceria como 1, e "2026. foi o ano" perderia o
        // ano na renderização.
        blocks.push({
          type: 'list',
          ordered: Boolean(ordered),
          start: ordered ? Number(ordered[1]) : 1,
          items: [parseInline(item)],
        });
      }
      continue;
    }

    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}
