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
import { parseInline, type Inline } from '@/utils/richTextInline';

export { parseInline };
export type { Inline };

export type Block =
  | { type: 'heading'; level: 2 | 3; spans: Inline[] }
  | { type: 'paragraph'; spans: Inline[] }
  | { type: 'quote'; spans: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'code'; language: string; value: string }
  | { type: 'divider' }
  | { type: 'reveal'; prompt: Inline[]; answer: Inline[] };

/** O que sobra depois do `splitSteps` — o `---` vira fronteira, não conteúdo. */
export type StepBlock = Exclude<Block, { type: 'divider' }>;

const HEADING = /^(#{2,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
const ORDERED = /^(\d+)[.)]\s+(.*)$/;
const FENCE = /^```(.*)$/;
const DIVIDER = /^-{3,}$/;
const ASK = /^\?>\s?(.*)$/;
const ANSWER = /^\?=\s?(.*)$/;

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

    if (DIVIDER.test(trimmed)) {
      flush();
      blocks.push({ type: 'divider' });
      continue;
    }

    if (ASK.test(trimmed) || ANSWER.test(trimmed)) {
      flush();
      const ask: string[] = [];
      const answer: string[] = [];
      // A resposta é consumida junto do enunciado para que um `?=` órfão nunca
      // sobre como texto cru na tela do aluno.
      while (i < lines.length) {
        const current = lines[i].trim();
        const isAsk = current.match(ASK);
        const isAnswer = current.match(ANSWER);
        if (isAsk) ask.push(isAsk[1]);
        else if (isAnswer) answer.push(isAnswer[1]);
        else break;
        i++;
      }
      i--;
      blocks.push({
        type: 'reveal',
        prompt: ask.length > 0 ? parseInline(ask.join('\n')) : [],
        answer: answer.length > 0 ? parseInline(answer.join('\n')) : [],
      });
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

/**
 * Agrupa os blocos nos `---`, que é o que dá RITMO à tela de conceito: em vez de
 * despejar tudo de uma vez, o aluno recebe um pedaço, respira, e pede o próximo.
 *
 * Grupo vazio é descartado — `---` colado no começo, no fim ou dobrado é erro de
 * digitação do autor, e um passo em branco no meio quebraria a contagem que o
 * aluno usa pra saber quanto falta. Sem nenhum `---`, devolve um grupo só: a
 * tela se comporta exatamente como antes.
 */
export function splitSteps(blocks: Block[]): StepBlock[][] {
  const steps: StepBlock[][] = [];
  let current: StepBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'divider') {
      if (current.length > 0) steps.push(current);
      current = [];
      continue;
    }
    current.push(block);
  }
  if (current.length > 0) steps.push(current);
  return steps;
}
