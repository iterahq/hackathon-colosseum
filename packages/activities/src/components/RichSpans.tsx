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
import { HighlightDelay } from './highlightDelay.js';

// `==key phrase==` is the highlighter: a soft pill that sweeps in once the
// block lands. Bold stays plain emphasis so only the key phrase is marked.
const HIGHLIGHT = 'linear-gradient(rgba(63,209,127,.10), rgba(63,209,127,.10))';

export function RichSpans({ spans }: { spans: Inline[] }) {
  const reduced = useReducedMotion();
  const delay = useContext(HighlightDelay);
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === 'strong')
          return (
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
              animate={{ backgroundSize: '100% 100%' }}
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
            <code
              key={i}
              className="rounded bg-evergreen-soft/70 px-1 py-0.5 font-mono text-[0.85em] text-menta"
            >
              {span.value}
            </code>
          );
        return <span key={i}>{span.value}</span>;
      })}
    </>
  );
}
