/**
 * RichBlock — um bloco já parseado, com o peso visual que ele pede.
 *
 * `muted` existe porque o mesmo desenho serve o texto principal da instrução e
 * a descrição secundária embaixo dela, que precisa continuar sendo secundária.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CERCA ```mermaid VIRA DESENHO — EM QUALQUER KIND
 * ─────────────────────────────────────────────────────────────────────────────
 * O `diagram` é uma TELA inteira, e tela separada chega tarde: o aluno vê o
 * desenho, avança, e quando enfim está escrevendo o código o desenho já saiu
 * da vista. Reconhecendo a cerca aqui, o mesmo desenho passa a caber DENTRO do
 * enunciado do exercício — e de tabela, e de conceito — sem campo novo no spec
 * e sem release do `@iterahq/activity-spec`: `prompt` já é texto rico.
 *
 * A degradação é a MESMA do `DiagramActivity`, e não é cortesia: fonte que o
 * `parseMermaidLite` recusa continua caindo no `<pre>` de sempre. Nenhuma cerca
 * que já está no banco pode piorar por causa desta mudança.
 */
import { RichSpans } from './RichSpans.js';
import { MermaidLite } from './MermaidLite.js';
import { parseMermaidLite } from '../internal/mermaidLite.js';
import type { Block } from '../internal/richText.js';

export function RichBlock({
  block,
  muted,
}: {
  block: Block;
  muted: boolean;
}) {
  // Body text is Inter: Barlow Condensed stays on headings only, because a
  // condensed face in long paragraphs read as slanted and tiring (2026-09-30).
  const body = muted
    ? 'text-sm text-muted-foreground leading-relaxed'
    : 'font-body text-base md:text-lg text-foreground leading-relaxed';

  if (block.type === 'heading')
    return (
      <h3
        className={`font-display font-semibold text-foreground ${
          block.level === 2 ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'
        }`}
        data-rich-block="heading"
      >
        <RichSpans spans={block.spans} />
      </h3>
    );

  if (block.type === 'quote')
    return (
      <blockquote
        className={`rounded-xl border-l-4 border-evergreen bg-evergreen-soft/50 px-4 py-3 font-medium ${body}`}
        data-rich-block="quote"
      >
        <RichSpans spans={block.spans} />
      </blockquote>
    );

  if (block.type === 'code' && block.language === 'mermaid') {
    const graph = parseMermaidLite(block.value);
    if (graph)
      return (
        <div
          className="rounded-2xl border border-border bg-obsidiana/60 p-4 grid-pattern"
          data-rich-block="mermaid"
        >
          <MermaidLite graph={graph} />
        </div>
      );
  }

  if (block.type === 'code')
    return (
      <pre
        className="overflow-x-auto rounded-2xl border border-border bg-obsidiana/80 p-4"
        data-rich-block="code"
        data-language={block.language || undefined}
      >
        <code className="font-mono text-sm text-menta">{block.value}</code>
      </pre>
    );

  if (block.type === 'list' && block.ordered)
    return (
      <ol
        className={`list-decimal space-y-1.5 pl-5 marker:text-evergreen ${body}`}
        data-rich-block="list"
        start={block.start}
      >
        {block.items.map((item, i) => (
          <li key={i}>
            <RichSpans spans={item} />
          </li>
        ))}
      </ol>
    );

  if (block.type === 'list')
    return (
      <ul
        className={`list-disc space-y-1.5 pl-5 marker:text-evergreen ${body}`}
        data-rich-block="list"
      >
        {block.items.map((item, i) => (
          <li key={i}>
            <RichSpans spans={item} />
          </li>
        ))}
      </ul>
    );

  return (
    <p className={`whitespace-pre-line ${body}`} data-rich-block="paragraph">
      <RichSpans spans={block.spans} />
    </p>
  );
}
