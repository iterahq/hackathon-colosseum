/**
 * RichText — desenha os blocos de `parseRichText` na linguagem visual da marca.
 *
 * A tela conceitual era um <p> corrido: o aluno via um muro de texto e, quando
 * o autor marcava alguma coisa, via os asteriscos junto. Aqui cada bloco ganha
 * o peso certo (título, citação, lista, código) e entra em cascata curta, que é
 * o que faz o olho percorrer a tela em vez de desistir dela.
 *
 * Mostra TUDO de uma vez. A paginação por `---` ("continuar lendo") saiu em
 * 2026-07-31: o clique não entregava informação nenhuma em troca, só adiava a
 * leitura. Conceito é slide — o aluno vê a tela inteira e segue.
 *
 * Each block rises when it reaches the screen (`RevealBlock`): the opening
 * cascades, and on a long text the rest lands as the reader scrolls to it,
 * so moving down the page is what makes the next block appear. Nothing is
 * hidden behind a click — the block is already there, it only settles.
 *
 * `reading` is the long-form screen (concept, concept_reveal): wider rhythm,
 * the opening paragraph one size up, numbered sections when there is more
 * than one. The prompt above an exercise keeps the compact rhythm.
 */
import { useReducedMotion } from 'framer-motion';
import { RichBlock } from './RichBlock.js';
import { RevealBlock } from './RevealBlock.js';
import { parseRichText, type Block } from '../internal/richText.js';

/** The opening paragraph: the first block, or the one right under an opening heading. */
function leadIndex(blocks: Block[]): number {
  if (blocks[0]?.type === 'paragraph') return 0;
  if (blocks[0]?.type === 'heading' && blocks[1]?.type === 'paragraph') return 1;
  return -1;
}

export function RichText({
  text,
  muted = false,
  reading = false,
  className = '',
  'data-testid': testId,
}: {
  text: string;
  muted?: boolean;
  /** Long-form reading screen, as opposed to the prompt above an exercise. */
  reading?: boolean;
  className?: string;
  'data-testid'?: string;
}) {
  const blocks = parseRichText(text);
  const reduced = useReducedMotion() ?? false;
  const longForm = reading && !muted;
  const lead = longForm ? leadIndex(blocks) : -1;
  const sections = longForm
    ? blocks.filter((b) => b.type === 'heading' && b.level === 2).length
    : 0;
  let section = 0;

  return (
    <div className={className} data-testid={testId}>
      <div className={longForm ? 'space-y-4' : 'space-y-3'} data-rich-blocks={blocks.length}>
        {blocks.map((block, i) => {
          const numbered = sections > 1 && block.type === 'heading' && block.level === 2;
          return (
            <RevealBlock key={i} index={i} reduced={reduced}>
              <RichBlock
                block={block}
                muted={muted}
                lead={i === lead}
                section={numbered ? ++section : undefined}
              />
            </RevealBlock>
          );
        })}
      </div>
    </div>
  );
}
