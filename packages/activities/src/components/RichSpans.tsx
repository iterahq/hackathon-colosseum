/**
 * RichSpans — o miolo de uma linha: negrito, marca-texto, ênfase e código inline.
 *
 * O `code` inline usa a cor de marca em vez de cinza porque quase todo uso real
 * é nome de comando ou de variável no meio da frase (`git pull`, `useState`), e
 * é justamente isso que o aluno precisa achar de relance quando volta na tela.
 */
import { useContext } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Inline } from '../internal/richText.js';
import { BlockReveal } from './blockReveal.js';
import { TermChip } from './TermChip.js';
import { pickTerms } from '../internal/termChip.js';

// `==key phrase==` is the highlighter: a soft pill that sweeps in once the
// block lands. Bold stays plain emphasis so only the key phrase is marked.
const HIGHLIGHT = 'linear-gradient(rgba(63,209,127,.10), rgba(63,209,127,.10))';

// Inline code is a keycap: the same ledge the tactile surfaces press on, at
// chip size, so a command name reads as something you type.
const KEYCAP =
  'rounded-md border border-border border-b-2 bg-obsidiana/80 px-1.5 py-0.5 font-mono text-[0.85em] text-menta';

export function RichSpans({
  spans,
  terms = false,
}: {
  spans: Inline[];
  /** Raise the bold runs that name a term (`internal/termChip.ts`). Only the body of a reading block opts in. */
  terms?: boolean;
}) {
  const reduced = useReducedMotion();
  const { landed, delay } = useContext(BlockReveal);
  const chip = terms ? pickTerms(spans) : null;
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === 'strong')
          return chip?.[i] ? (
            <TermChip key={i}>
              <RichSpans spans={span.spans} />
            </TermChip>
          ) : (
            <strong key={i} className="font-semibold text-foreground">
              <RichSpans spans={span.spans} />
            </strong>
          );
        if (span.type === 'mark')
          return (
            <motion.mark
              key={i}
              className="-mx-0.5 rounded-md bg-transparent bg-no-repeat px-1 text-foreground"
              style={{
                backgroundImage: HIGHLIGHT,
                boxShadow: 'inset 0 -2px 0 rgba(63,209,127,.4)',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }}
              initial={reduced ? false : { backgroundSize: '0% 100%' }}
              animate={{ backgroundSize: landed || reduced ? '100% 100%' : '0% 100%' }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: reduced ? 0 : delay + 0.3 }}
            >
              <RichSpans spans={span.spans} />
            </motion.mark>
          );
        if (span.type === 'em')
          return (
            <em key={i} className="italic">
              <RichSpans spans={span.spans} />
            </em>
          );
        if (span.type === 'code')
          return (
            <code key={i} className={KEYCAP}>
              {span.value}
            </code>
          );
        return <span key={i}>{span.value}</span>;
      })}
    </>
  );
}
