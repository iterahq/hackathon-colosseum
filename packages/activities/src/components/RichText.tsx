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
 */
import { motion, useReducedMotion } from 'framer-motion';
import { RichBlock } from './RichBlock.js';
import { HighlightDelay } from './highlightDelay.js';
import { parseRichText } from '../internal/richText.js';

export function RichText({
  text,
  muted = false,
  className = '',
  'data-testid': testId,
}: {
  text: string;
  muted?: boolean;
  className?: string;
  'data-testid'?: string;
}) {
  const blocks = parseRichText(text);
  const reduced = useReducedMotion();

  return (
    <div className={className} data-testid={testId}>
      <div className="space-y-3" data-rich-blocks={blocks.length}>
        {blocks.map((block, i) => {
          const delay = reduced ? 0 : Math.min(i, 8) * 0.12;
          return (
            <motion.div
              key={i}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay }}
            >
              <HighlightDelay.Provider value={delay}>
                <RichBlock block={block} muted={muted} />
              </HighlightDelay.Provider>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
