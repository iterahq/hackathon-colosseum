/**
 * JudgeHeatmap — renders the AI-judge verdict for an open-scope activity as a
 * FLUID HEAT-MAP (per-rubric-criterion chips colored by met/unmet) + an overall
 * score + textual feedback. NOT a hard gate (ADR judge-fluid-heatmap-confirmed):
 * a low score still records the result and shows guidance; it does not block.
 */
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, Sparkles } from 'lucide-react';
import type { JudgeVerdict } from '@/api/iteraApi';

function scoreTone(score: number | null): { ring: string; text: string } {
  if (score === null) return { ring: 'border-border', text: 'text-muted-foreground' };
  if (score >= 75) return { ring: 'border-evergreen/50', text: 'text-evergreen-hi' };
  if (score >= 50) return { ring: 'border-amber-500/50', text: 'text-amber-400' };
  return { ring: 'border-clay/50', text: 'text-clay' };
}

export function JudgeHeatmap({ verdict }: { verdict: JudgeVerdict }) {
  const pending = verdict.status === 'pending' || !verdict.judge_available;
  const tone = scoreTone(verdict.score);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-2xl border border-border bg-obsidiana/40 p-5"
      data-testid="judge-heatmap"
      data-judge-status={verdict.status}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-menta" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">
          AI Judge
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {pending ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
              <Clock className="w-4 h-4" /> Em revisão
            </span>
          ) : (
            <span
              className={`inline-flex items-center justify-center w-12 h-12 rounded-full border-2 font-display text-lg ${tone.ring} ${tone.text}`}
              data-testid="judge-score"
            >
              {verdict.score ?? '—'}
            </span>
          )}
        </span>
      </div>

      {/* Per-criterion heat-map */}
      {verdict.criteria.length > 0 && (
        <ul className="space-y-2" data-testid="judge-criteria">
          {verdict.criteria.map((c, i) => (
            <li
              key={i}
              className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                c.met
                  ? 'border-evergreen/30 bg-evergreen-soft/40'
                  : 'border-clay/30 bg-clay/10'
              }`}
              data-testid="judge-criterion"
              data-met={c.met}
            >
              {c.met ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-evergreen-hi" />
              ) : (
                <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-clay" />
              )}
              <div>
                <p className="text-sm text-foreground">{c.criterion}</p>
                {c.note && <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Textual feedback */}
      {verdict.feedback && (
        <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{verdict.feedback}</p>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground/70 font-mono">
        {verdict.model} · {pending ? 'pendente' : verdict.passed ? 'aprovado' : 'continue iterando'}
      </p>
    </motion.div>
  );
}
