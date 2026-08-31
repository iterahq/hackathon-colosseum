/**
 * Diagram — a DISPLAY kind: an authored prompt over either an image or a
 * mermaid source, with optional glowing "highlights" that name the terms the
 * learner should take away.
 *
 * Like `concept`, it never fires `onComplete`: there is nothing to get right.
 * Advancing is the shell's job. `onComplete` stays in the prop type for the
 * uniform dispatch and is deliberately not destructured, which is the same
 * shape `ConceptActivity` uses.
 *
 * ⚠️ `spec.imageUrl` and `spec.mermaid` are ALTERNATIVES, and image wins. That
 * is not arbitrary: a row that carries both is a row mid-migration from a
 * hand-drawn asset to a source, and showing the picture is the safer of the two
 * (a mermaid source that has not been rendered is a wall of text where a
 * diagram belongs). With neither, the prompt is repeated inside the frame so
 * the panel is never an empty box.
 *
 * ⚠️ The field is `imageUrl`, camelCase — NOT `image_url` like the
 * InstructionPanel's. Both spellings are live in production and neither is a
 * typo: `diagram` predates the v1 taxonomy that standardised on snake_case, and
 * renaming it is a data migration, not a rename. `@iterahq/activity-spec@0.10.0`
 * declares it exactly this way, which is what the back-office form generates
 * against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O `<pre>` NÃO SAIU — ele virou o CHÃO
 * ─────────────────────────────────────────────────────────────────────────────
 * `parseMermaidLite` cobre um subconjunto pequeno da sintaxe (ver o docblock de
 * `internal/mermaidLite.ts`) e devolve `null` para todo o resto — `erDiagram`,
 * `subgraph`, cadeia `A --> B --> C`, `;` como separador. Toda fonte que ele
 * recusa continua caindo no MESMO `<pre>` de antes. A regra é que ligar o
 * desenho não pode piorar nenhuma linha que já existe no banco: o desenho é
 * ganho para quem escrever dentro do subconjunto, nunca perda para quem não.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OS HIGHLIGHTS VIRARAM PONTEIRO
 * ─────────────────────────────────────────────────────────────────────────────
 * O professor dá esta tela AO VIVO, no projetor, com a turma acompanhando pelo
 * celular. O chip que só pulsa não diz A QUAL parte do desenho ele se refere, e
 * "esse aí, ó" não chega em quem está olhando a tela pequena. Quando o `term` do
 * highlight bate com o rótulo de um nó (comparação normalizada — ver
 * `normalizeMermaidLabel`), chip e nó passam a acender juntos, nos dois sentidos.
 *
 * Degradação limpa é requisito, não cortesia: se NENHUM term casar, os chips
 * voltam a ser exatamente o que eram — `<div>` que pulsa, sem foco e sem
 * `aria-pressed` mentindo que há algo para apertar. O estado é local ao
 * componente; nada disso vaza para o host.
 */
import { useMemo, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { PortableActivity } from '../renderer.js';
import type { DiagramSpec } from '../specs.js';
import { parseInline } from '../internal/richText.js';
import { normalizeMermaidLabel, parseMermaidLite } from '../internal/mermaidLite.js';
import { RichSpans } from '../components/RichSpans.js';
import { MermaidLite } from '../components/MermaidLite.js';
import { ActivityShell } from '../components/parts.js';

export function DiagramActivity({
  activity,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as DiagramSpec;

  const graph = useMemo(() => parseMermaidLite(spec?.mermaid), [spec?.mermaid]);
  const highlights = spec?.highlights;

  /** `term` do highlight → id do nó, só para os que de fato casam. */
  const linked = useMemo(() => {
    const pairs = new Map<string, string>();
    if (!graph || !highlights?.length) return pairs;

    const byLabel = new Map<string, string>();
    for (const node of graph.nodes) {
      const key = normalizeMermaidLabel(node.label);
      if (!byLabel.has(key)) byLabel.set(key, node.id);
    }
    for (const highlight of highlights) {
      const id = byLabel.get(normalizeMermaidLabel(highlight.term));
      if (id) pairs.set(highlight.term, id);
    }
    return pairs;
  }, [graph, highlights]);

  // Fixado (clique/Enter) e sob o ponteiro/foco são estados SEPARADOS: se
  // fossem um só, o clique — que passa o foco antes — apagaria na mesma
  // interação o nó que acabou de acender.
  const [pinned, setPinned] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const active = preview ?? pinned;

  const interactiveNodeIds = useMemo(() => [...new Set(linked.values())], [linked]);

  return (
    <ActivityShell kind="diagram" icon={GitBranch} label={t('activity.diagram')}>
      <h2 className="font-display text-foreground">
        <RichSpans spans={parseInline(spec?.prompt ?? t('activity.diagram'))} />
      </h2>
      <div
        className="mt-4 rounded-2xl border border-border bg-obsidiana/60 p-4 grid-pattern"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setPinned(null);
        }}
      >
        {spec?.imageUrl ? (
          <img src={spec.imageUrl} alt={spec.prompt ?? 'diagram'} className="mx-auto rounded-xl" />
        ) : graph ? (
          <MermaidLite
            graph={graph}
            title={spec?.prompt ?? t('activity.diagram')}
            interactiveNodeIds={interactiveNodeIds}
            activeNodeId={active}
            pinnedNodeId={pinned}
            onNodePin={(id) => setPinned((current) => (current === id ? null : id))}
            onNodePreview={setPreview}
          />
        ) : spec?.mermaid ? (
          <pre
            className="font-mono text-xs text-menta overflow-x-auto whitespace-pre"
            data-testid="diagram-mermaid-source"
          >
            {spec.mermaid}
          </pre>
        ) : (
          <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <GitBranch className="w-6 h-6 text-menta" />
            <span className="text-sm">{spec?.prompt}</span>
          </div>
        )}
      </div>
      {highlights?.length ? (
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2"
          data-testid="diagram-highlights"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPinned(null);
          }}
        >
          {highlights.map((highlight, i) => {
            const nodeId = linked.get(highlight.term);
            const body = (
              <>
                <code className="font-mono text-base font-semibold text-menta">
                  {highlight.term}
                </code>
                {highlight.caption && (
                  <p className="mt-1 text-sm text-muted-foreground">{highlight.caption}</p>
                )}
              </>
            );

            if (!nodeId)
              return (
                <div
                  key={`${highlight.term}-${i}`}
                  className="animate-pulse-glow rounded-xl border border-menta/50 bg-menta/10 px-4 py-3"
                  style={{ animationDelay: `${i * 600}ms` }}
                >
                  {body}
                </div>
              );

            const lit = active === nodeId;
            return (
              <button
                key={`${highlight.term}-${i}`}
                type="button"
                aria-pressed={pinned === nodeId}
                data-node-id={nodeId}
                data-active={lit ? 'true' : undefined}
                onClick={() => setPinned((current) => (current === nodeId ? null : nodeId))}
                onFocus={() => setPreview(nodeId)}
                onBlur={() => setPreview(null)}
                onMouseEnter={() => setPreview(nodeId)}
                onMouseLeave={() => setPreview(null)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  lit
                    ? 'border-menta bg-menta/20'
                    : 'animate-pulse-glow border-menta/50 bg-menta/10'
                }`}
                style={lit ? undefined : { animationDelay: `${i * 600}ms` }}
              >
                {body}
              </button>
            );
          })}
        </div>
      ) : null}
    </ActivityShell>
  );
}
