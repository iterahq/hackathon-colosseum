/**
 * RichSpans — o miolo de uma linha: negrito, ênfase e código inline.
 *
 * O `code` inline usa a cor de marca em vez de cinza porque quase todo uso real
 * é nome de comando ou de variável no meio da frase (`git pull`, `useState`), e
 * é justamente isso que o aluno precisa achar de relance quando volta na tela.
 */
import type { Inline } from '@/utils/richText';

export function RichSpans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === 'strong')
          return (
            <strong key={i} className="font-semibold text-foreground">
              <RichSpans spans={span.spans} />
            </strong>
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
