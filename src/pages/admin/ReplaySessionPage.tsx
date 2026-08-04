/**
 * ONE attempt, watched back — the replay itself.
 *
 * Plan `20260803-itera-replay-de-sessao-de-atividade`, Fase 1 (thinnest honest
 * version; the cut list is in the PR body).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT RENDERS, AND WHAT IT REFUSES TO RENDER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The enunciado comes from `activity_traces.spec_snapshot`, resolved for
 * `spec_locale` — the wording and the language THIS learner had in front of
 * them. When the snapshot is NULL the panel says so, in as many words, and
 * renders nothing else. It never falls back to `itera.activities.spec`: that
 * column is mutable (trigger `activity_defs_sync_instances`, migration 0024)
 * and locale-resolved at render time, so the fallback would show today's
 * wording in the WATCHER's language while looking exactly like the truth. That
 * is the failure this whole feature exists to avoid, and it is enforced by
 * construction — `ReplayEnunciado` is a tagged union and this file has no route
 * to the live spec at all.
 *
 * ⚠️ THE ORDER ON SCREEN IS THE AUTHORED ORDER, NOT THE SHUFFLED ONE. Options
 * are shuffled per-learner (`learnerShuffle.ts`, seeded on the learner's id), and
 * reproducing that seed is Fase 2. So the panel SAYS the layout is authored
 * rather than implying it is faithful. The MEANING is exact regardless, because
 * every action carries the AUTHORED option id and never a post-shuffle index.
 *
 * ⚠️ MEDIA IS A URL, NOT AN ASSET (migration 0037's header). If the host has
 * dropped the file, the replay degrades — and it says "asset unavailable"
 * rather than rendering a broken box.
 *
 * READ-ONLY: no writes, no `progress.service` import, no mutation of any kind.
 * A curator watching must never become learner data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Badge, Button } from '@devfellowship/components';
import { useI18n, type Locale } from '@/i18n';
import { useReplaySession } from '@/hooks/useReplay';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import {
  familyEmitsSequence,
  formatOffset,
  gapsBetween,
  labelIndexFor,
  replayStateAt,
} from '@/utils/replaySession';
import { AdminError, AdminLoading, AdminEmpty } from './AdminStates';

/**
 * The longest this surface waits between two actions during playback.
 *
 * A real trace can hold a four-minute gap (that IS the interesting bit — it is
 * where the learner stopped and thought), and waiting it out in wall-clock would
 * make the feature unusable on its first use. So playback COMPRESSES idle time
 * and the row it lands on states the TRUE gap next to it. The clock is
 * compressed; the data displayed never is.
 *
 * Fase 2 replaces this with 1×/2×/3× and a scrub — deliberately cut from this
 * version, see the PR body.
 */
const MAX_STEP_MS = 2000;

export default function ReplaySessionPage() {
  const { traceId } = useParams<{ traceId: string }>();
  const { t } = useI18n();
  const { data, isPending, isError, refetch } = useReplaySession(traceId);

  // `cursor` = how many actions have been applied. 0 is the state before the
  // learner did anything; `actions.length` is the settled end.
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  const actions = useMemo(() => data?.actions ?? [], [data]);
  const gaps = useMemo(() => gapsBetween(actions), [actions]);
  const state = useMemo(() => replayStateAt(actions, cursor), [actions, cursor]);

  const spec = useMemo(() => {
    if (!data || data.enunciado.status !== 'captured') return null;
    // Collapse any `{pt,en}` bags for the locale THE LEARNER READ — never the
    // watcher's. Already-resolved specs pass through untouched, which is the
    // normal case; `sandbox_scenario` is the one kind snapshotted unresolved.
    const locale: Locale = data.enunciado.locale === 'en' ? 'en' : 'pt';
    return resolveLocalizedSpec(data.enunciado.spec, locale);
  }, [data]);

  const labels = useMemo(() => labelIndexFor(spec), [spec]);

  // Playback: schedule the next step at the TRUE gap, capped. Cleared on pause,
  // on unmount, and when the cursor reaches the end.
  useEffect(() => {
    if (!playing) return;
    if (cursor >= actions.length) {
      setPlaying(false);
      return;
    }
    const wait = Math.min(gaps[cursor] ?? 0, MAX_STEP_MS);
    const id = window.setTimeout(() => setCursor((c) => c + 1), Math.max(250, wait));
    return () => window.clearTimeout(id);
  }, [playing, cursor, actions.length, gaps]);

  const restart = useCallback(() => {
    setCursor(0);
    setPlaying(false);
  }, []);

  if (isPending) return <AdminLoading />;
  if (isError) return <AdminError onRetry={() => void refetch()} />;
  // Null covers "no such trace" and "not a learner of your tenant" alike, on
  // purpose: distinguishing them would confirm another tenant's row exists.
  if (!data) return <AdminEmpty message={t('replay.notFound')} />;

  const emits = familyEmitsSequence(data.kind);
  const label = (id: string) => labels[id] ?? id;

  return (
    <div className="space-y-5" data-testid="replay-session">
      <Link
        to="/admin/replay"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('replay.back')}
      </Link>

      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">
          {data.kind ?? t('replay.unknownKind')}
        </h2>
        {data.outcome === 'abandoned' && (
          <Badge variant="secondary" data-testid="replay-abandoned">
            {t('replay.abandoned')}
          </Badge>
        )}
        {state.passed !== null && (
          <Badge variant={state.passed ? 'default' : 'destructive'}>
            {state.passed ? t('replay.passed') : t('replay.failed')}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {data.startedAt ? new Date(data.startedAt).toLocaleString() : '—'}
        </span>
      </header>

      {/* ── The enunciado, or the honest absence of it ─────────────────────── */}
      {data.enunciado.status === 'not_captured' ? (
        <section
          data-testid="replay-enunciado-missing"
          className="rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/5 p-5"
        >
          <div className="mb-2 flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-semibold">{t('replay.enunciado.missingTitle')}</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('replay.enunciado.missingBody')}</p>
        </section>
      ) : (
        <section
          data-testid="replay-enunciado"
          data-locale={data.enunciado.locale}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-menta">
              {t('replay.enunciado.title')}
            </span>
            <Badge variant="secondary">{data.enunciado.locale}</Badge>
          </div>

          <EnunciadoBody spec={spec} unavailable={t('replay.enunciado.assetUnavailable')} />

          {/* The options, highlighted by the replayed state. */}
          <ReplayOptions spec={spec} selected={state.selected} order={state.order} pairs={state.pairs} label={label} />

          <p className="mt-4 text-xs text-muted-foreground" data-testid="replay-authored-order-note">
            {t('replay.authoredOrderNote')}
          </p>
        </section>
      )}

      {/* ── The sequence ───────────────────────────────────────────────────── */}
      {!emits && (
        <p
          className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
          data-testid="replay-family-not-wired"
        >
          {t('replay.familyNotWired')}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={restart} data-testid="replay-restart">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t('replay.restart')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            data-testid="replay-prev"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => setPlaying((p) => !p)}
            data-testid="replay-play"
            aria-label={playing ? t('replay.pause') : t('replay.play')}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursor((c) => Math.min(actions.length, c + 1))}
            data-testid="replay-next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground" data-testid="replay-cursor">
            {cursor}/{actions.length}
          </span>
        </div>

        <ol className="space-y-1" data-testid="replay-timeline">
          {actions.map((action, i) => (
            <li
              key={`${action.type}-${action.at_ms}-${i}`}
              data-testid="replay-step"
              data-active={i < cursor ? 'true' : 'false'}
              className={`flex items-baseline gap-3 rounded-lg px-3 py-1.5 text-sm ${
                i < cursor ? 'bg-muted/40 text-foreground' : 'text-muted-foreground/60'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setCursor(i + 1);
                }}
                className="font-mono text-xs tabular-nums hover:underline"
              >
                {formatOffset(action.at_ms)}
              </button>
              <span className="flex-1">{describe(action.type, action.payload, label, t)}</span>
              {gaps[i] > 1000 && i > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  +{formatOffset(gaps[i])}
                </span>
              )}
            </li>
          ))}
        </ol>

        {data.actionsTruncated && (
          <p className="mt-3 text-xs text-amber-500" data-testid="replay-truncated">
            {t('replay.truncated')}
          </p>
        )}
        {data.fromFuture && (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="replay-from-future">
            {t('replay.fromFuture')}
          </p>
        )}
      </section>
    </div>
  );
}

/** Instruction text + media, straight from the snapshot. */
function EnunciadoBody({
  spec,
  unavailable,
}: {
  spec: Record<string, unknown> | null;
  unavailable: string;
}) {
  const instruction =
    spec && typeof spec.instruction === 'object' && spec.instruction && !Array.isArray(spec.instruction)
      ? (spec.instruction as Record<string, unknown>)
      : {};
  const text = pick(instruction, 'text') || pick(spec ?? {}, 'prompt') || pick(spec ?? {}, 'question');
  const description = pick(instruction, 'description');
  const imageUrl = pick(instruction, 'image_url');

  return (
    <div className="space-y-2">
      {text && <p className="whitespace-pre-wrap text-base text-foreground">{text}</p>}
      {description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="max-h-64 rounded-xl border border-border object-contain"
          // The snapshot preserved the URL, never the asset (migration 0037).
          // Say the asset is gone rather than render a broken box.
          onError={(e) => {
            const el = e.currentTarget;
            el.replaceWith(
              Object.assign(document.createElement('p'), {
                className: 'text-xs text-muted-foreground',
                textContent: unavailable,
              })
            );
          }}
        />
      )}
    </div>
  );
}

/** Options / items / pairs, highlighted by the replayed state. */
function ReplayOptions({
  spec,
  selected,
  order,
  pairs,
  label,
}: {
  spec: Record<string, unknown> | null;
  selected: string[];
  order: string[];
  pairs: Array<[string, string]>;
  label: (id: string) => string;
}) {
  const options = listOf(spec, 'options');
  const items = listOf(spec, 'items');
  const left = listOf(spec, 'left');

  if (options.length > 0) {
    return (
      <ul className="mt-4 space-y-1.5" data-testid="replay-options">
        {options.map((id) => (
          <li
            key={id}
            data-testid="replay-option"
            data-selected={selected.includes(id) ? 'true' : 'false'}
            className={`rounded-xl border px-3 py-2 text-sm ${
              selected.includes(id)
                ? 'border-menta bg-menta/10 text-foreground'
                : 'border-border text-muted-foreground'
            }`}
          >
            {label(id)}
          </li>
        ))}
      </ul>
    );
  }

  if (items.length > 0) {
    const current = order.length > 0 ? order : items;
    return (
      <ol className="mt-4 space-y-1.5" data-testid="replay-order">
        {current.map((id, i) => (
          <li key={id} className="rounded-xl border border-border px-3 py-2 text-sm text-foreground">
            <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
            {label(id)}
          </li>
        ))}
      </ol>
    );
  }

  if (left.length > 0) {
    return (
      <ul className="mt-4 space-y-1.5" data-testid="replay-pairs">
        {left.map((id) => {
          const made = pairs.find(([l]) => l === id);
          return (
            <li
              key={id}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="text-foreground">{label(id)}</span>
              <span className="text-muted-foreground">→</span>
              <span className={made ? 'text-menta' : 'text-muted-foreground/50'}>
                {made ? label(made[1]) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return null;
}

function pick(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return typeof v === 'string' ? v : '';
}

function listOf(spec: Record<string, unknown> | null, key: string): string[] {
  const list = spec?.[key];
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => (e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>).id : null))
    .filter((v): v is string => typeof v === 'string' && v !== '');
}

/**
 * One action as a sentence. Unknown types fall back to the raw type string —
 * the read side must never choke on a vocabulary a newer build introduced.
 */
function describe(
  type: string,
  payload: Record<string, unknown> | undefined,
  label: (id: string) => string,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const p = payload ?? {};
  const id = (key: string) => (typeof p[key] === 'string' ? label(p[key] as string) : '?');
  switch (type) {
    case 'activity_opened':
      return t('replay.action.opened');
    case 'option_selected':
      return t('replay.action.optionSelected', { option: id('option_id') });
    case 'option_deselected':
      return t('replay.action.optionDeselected', { option: id('option_id') });
    case 'item_moved':
      return t('replay.action.itemMoved', { item: id('item_id') });
    case 'pair_armed':
      return t('replay.action.pairArmed', { left: id('left_id') });
    case 'pair_made':
      return t('replay.action.pairMade', { left: id('left_id'), right: id('right_id') });
    case 'pair_broken':
      return t('replay.action.pairBroken', { left: id('left_id'), right: id('right_id') });
    case 'answer_submitted':
      return t('replay.action.answerSubmitted');
    case 'attempt_settled':
      return p.passed === true
        ? t('replay.action.settledPassed')
        : t('replay.action.settledFailed');
    case 'attempt_abandoned':
      return t('replay.action.abandoned');
    default:
      return type;
  }
}
