/**
 * Open-scope `document` wired to the AI-generation + AI-judge loop:
 *
 *  1) the learner optionally picks a domain → the model generates a
 *     contextualized brief (a scenario plus an imperfect ER to critique);
 *  2) the learner writes their answer in a textarea;
 *  3) submit → AI judge → the per-criterion heat-map plus feedback.
 *
 * Fluid, not a gate (ADR judge-fluid-heatmap-confirmed): a pass advances, a
 * fail shows guidance and lets them iterate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT REPLACED THE PLAYER'S IMPORTS, AND WHY IT MATTERS BEYOND TIDINESS
 * ─────────────────────────────────────────────────────────────────────────────
 * In the Player this component imported `listSeeds` / `generateContext` /
 * `judge` from `@/api/iteraApi` and read `useAuth().session.access_token`. Both
 * are now the `api` port (ADR-3), which the host binds to its own auth before
 * injecting — so the package never receives, holds, or forwards a credential.
 *
 * The capability probe changed shape with it, and that is the part worth
 * reading twice. The Player decided whether to show this variant with
 * `iteraApiConfigured()`, a **build-time read of `import.meta.env`**. That
 * expression cannot travel: compiled into a package, it asks about the env of
 * whoever built the package, not of whoever runs it. `Boolean(api?.judge)` asks
 * the host, at runtime, and the host answers by supplying the method or not.
 * `DocumentActivity` is where that probe lives, so this component may assume it
 * has a judge — but it still guards each call, because a port can reject.
 *
 * ⚠️ THE FOUR PORTUGUESE LITERALS ARE THE SAME DEBT `JudgeHeatmap` CARRIES, for
 * the same reason: they were inline in the Player, and inventing dictionary
 * keys the Player does not have is exactly what `activityDefaultI18n.test.tsx`
 * forbids. Translating them is a follow-up with its own PR, noted in README.md.
 */
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useActivityHost, useActivityI18n } from '../../context.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import type { DocumentSpec } from '../../specs.js';
import type { ActivityBrief, ActivityJudgeVerdict, ActivitySeed } from '../../ports.js';
import { ActivityTextarea } from '../../components/ActivityTextarea.js';
import { ArtifactVisibilityNotice } from '../../components/ArtifactVisibilityNotice.js';
import { JudgeHeatmap } from '../../components/JudgeHeatmap.js';
import { RichText } from '../../components/RichText.js';
import { ActivityShell } from '../../components/parts.js';

export function AiJudgeDocumentActivity({
  activity,
  onComplete,
}: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
}) {
  const { t } = useActivityI18n();
  const { api, identity } = useActivityHost();
  const spec = activity.spec as unknown as DocumentSpec;

  const [seeds, setSeeds] = useState<ActivitySeed[]>([]);
  const [brief, setBrief] = useState<ActivityBrief | null>(null);
  const [generating, setGenerating] = useState(false);
  const [content, setContent] = useState('');
  const [verdict, setVerdict] = useState<ActivityJudgeVerdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listSeeds = api?.listSeeds;
  useEffect(() => {
    if (!listSeeds) return;
    let alive = true;
    listSeeds(activity.id)
      .then((s) => {
        if (alive) setSeeds(s);
      })
      .catch(() => {
        if (alive) setSeeds([]);
      });
    return () => {
      alive = false;
    };
  }, [activity.id, listSeeds]);

  // `authenticated` replaces the Player's `Boolean(session?.access_token)`.
  // Same guard, same place — the port is bound to the host's auth, so an
  // unauthenticated call would 401 rather than fail closed.
  const canCall = identity?.authenticated !== false;

  async function onPickSeed(seedId: string) {
    if (!api?.generateContext || !canCall) return;
    setGenerating(true);
    setError(null);
    try {
      setBrief(await api.generateContext(activity.id, seedId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onSubmit() {
    if (!api?.judge || !canCall || content.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const v = await api.judge(
        activity.id,
        content,
        brief
          ? {
              seed: brief.seed,
              domain: brief.domain,
              scenario: brief.scenario,
              proposed_er: brief.proposed_er,
            }
          : undefined
      );
      setVerdict(v);
      // Hand the learner's work UP so the host can persist it. Before PR #191
      // this content was posted to the judge, rendered as a verdict, and then
      // thrown away — the learner's actual work was the one thing not kept.
      if (v.passed) {
        onComplete(true, {
          artifact: {
            type: 'document',
            content,
            filename: 'data-spec.md',
            mimeType: 'text/markdown',
          },
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ActivityShell kind="document" icon={FileText} label={t('activity.document')}>
      <RichText text={spec?.prompt ?? t('activity.document')} data-testid="document-prompt" />
      {spec?.body && (
        <RichText text={spec.body} muted className="mt-4" data-testid="document-body" />
      )}

      {/* 1) Domain picker -> AI-generated brief */}
      {seeds.length > 0 && !brief && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground mb-2">
            Escolha um domínio — a IA vai gerar um cenário e um modelo (com falha) pra você
            criticar:
          </p>
          <div className="flex flex-wrap gap-2">
            {seeds.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickSeed(s.id)}
                disabled={generating}
                className="px-3 py-1.5 rounded-full border border-evergreen/30 bg-evergreen-soft text-evergreen-hi text-sm hover:bg-evergreen-soft/70 disabled:opacity-50"
                data-testid="seed-pick"
              >
                {s.label}
              </button>
            ))}
          </div>
          {generating && <p className="text-xs text-muted-foreground mt-2">Gerando cenário…</p>}
        </div>
      )}

      {brief && (
        <div
          className="mt-5 rounded-2xl border border-border bg-obsidiana/40 p-4"
          data-testid="generated-brief"
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-menta mb-2">
            Cenário gerado · {brief.domain}
          </p>
          <p className="text-sm text-foreground">{brief.scenario}</p>
          <pre className="mt-3 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {brief.proposed_er}
          </pre>
        </div>
      )}

      {/* 2) Learner submission */}
      <ActivityTextarea
        value={content}
        onChange={setContent}
        placeholder="Escreva seu data-spec.md: por que você modelou assim + as correções concretas que fez…"
        rows={8}
        className="mt-5 font-mono"
        data-testid="judge-submission-input"
      />

      <ArtifactVisibilityNotice />

      {error && <p className="mt-2 text-sm text-clay">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={submitting || content.trim().length === 0}
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi disabled:opacity-50"
        data-testid="judge-submit"
      >
        {submitting ? 'Avaliando…' : 'Enviar para avaliação da IA'}
      </button>

      {/* 3) Heat-map verdict */}
      {verdict && <JudgeHeatmap verdict={verdict} />}
    </ActivityShell>
  );
}
