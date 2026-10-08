/**
 * RichBlock — um bloco já parseado, com o peso visual que ele pede.
 *
 * `muted` existe porque o mesmo desenho serve o texto principal da instrução e
 * a descrição secundária embaixo dela, que precisa continuar sendo secundária.
 *
 * `lead` is the opening paragraph of a reading screen, one size up: the first
 * thing the eye lands on should look like the first thing, not like line four.
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
import { Quote } from 'lucide-react';
import { RichSpans } from './RichSpans.js';
import { RichHeading } from './RichHeading.js';
import { RichList } from './RichList.js';
import { RichCodeBlock } from './RichCodeBlock.js';
import { MermaidLite } from './MermaidLite.js';
import { parseMermaidLite } from '../internal/mermaidLite.js';
import { RichMedia } from './RichMedia.js';
import type { Block } from '../internal/richText.js';

export function RichBlock({
  block,
  muted,
  lead = false,
  section,
}: {
  block: Block;
  muted: boolean;
  lead?: boolean;
  /** 1-based position among the `##` headings, when the text has more than one. */
  section?: number;
}) {
  // Body text is Inter: Barlow Condensed stays on headings only, because a
  // condensed face in long paragraphs read as slanted and tiring (2026-09-30).
  const body = muted
    ? 'text-sm text-muted-foreground leading-relaxed'
    : lead
      ? 'font-body text-base md:text-lg text-foreground leading-normal'
      : 'font-body text-[15px] md:text-base text-foreground leading-normal';

  if (block.type === 'heading')
    return <RichHeading level={block.level} spans={block.spans} muted={muted} section={section} />;

  if (block.type === 'media')
    return (
      <div
        className={`grid gap-4 ${block.items.length > 1 ? 'md:grid-cols-2' : ''}`}
        data-rich-block="media"
      >
        {block.items.map((item, i) => (
          <RichMedia key={i} item={item} />
        ))}
      </div>
    );

  if (block.type === 'quote')
    return (
      <blockquote
        className={`relative rounded-xl border border-evergreen/25 border-l-4 border-l-evergreen bg-evergreen-soft/40 py-3 pl-11 pr-4 font-medium ${body}`}
        data-rich-block="quote"
      >
        <Quote className="absolute left-4 top-4 h-4 w-4 text-evergreen" aria-hidden="true" />
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

  if (block.type === 'code') return <RichCodeBlock language={block.language} value={block.value} />;

  if (block.type === 'list')
    return (
      <RichList
        ordered={block.ordered}
        start={block.start}
        items={block.items}
        muted={muted}
        textClass={body}
        terms={!muted}
      />
    );

  return (
    <p
      className={`whitespace-pre-line break-words ${body}`}
      data-rich-block="paragraph"
      data-lead={lead ? 'true' : undefined}
    >
      <RichSpans spans={block.spans} terms={!muted} />
    </p>
  );
}
