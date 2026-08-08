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
 */
import { GitBranch } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import type { PortableActivity } from '../renderer.js';
import type { DiagramSpec } from '../specs.js';
import { parseInline } from '../internal/richText.js';
import { RichSpans } from '../components/RichSpans.js';
import { ActivityShell } from '../components/parts.js';

export function DiagramActivity({
  activity,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean) => void;
}) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as DiagramSpec;

  return (
    <ActivityShell kind="diagram" icon={GitBranch} label={t('activity.diagram')}>
      <h2 className="font-display text-foreground">
        <RichSpans spans={parseInline(spec?.prompt ?? t('activity.diagram'))} />
      </h2>
      <div className="mt-4 rounded-2xl border border-border bg-obsidiana/60 p-4 grid-pattern">
        {spec?.imageUrl ? (
          <img src={spec.imageUrl} alt={spec.prompt ?? 'diagram'} className="mx-auto rounded-xl" />
        ) : spec?.mermaid ? (
          <pre className="font-mono text-xs text-menta overflow-x-auto whitespace-pre">
            {spec.mermaid}
          </pre>
        ) : (
          <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <GitBranch className="w-6 h-6 text-menta" />
            <span className="text-sm">{spec?.prompt}</span>
          </div>
        )}
      </div>
      {spec?.highlights?.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="diagram-highlights">
          {spec.highlights.map((h, i) => (
            <div
              key={h.term}
              className="animate-pulse-glow rounded-xl border border-menta/50 bg-menta/10 px-4 py-3"
              style={{ animationDelay: `${i * 600}ms` }}
            >
              <code className="font-mono text-base font-semibold text-menta">{h.term}</code>
              {h.caption && <p className="mt-1 text-sm text-muted-foreground">{h.caption}</p>}
            </div>
          ))}
        </div>
      ) : null}
    </ActivityShell>
  );
}
