/**
 * SandboxScenarioLive — the LIVE ("Bring Your Own Context") sandbox activity.
 *
 * ADDITIVE sibling of Samuel's deterministic `SandboxScenarioActivity`. It does
 * NOT modify his component, hook, or the `@iterahq/activity-spec` runtime — it
 * REUSES his presentational primitives (`ActivityShell`, `SandboxChatLog`,
 * `SandboxBubble`, `useAssistantStream`) and the shared `Message` type, and only
 * ADDS the real-LLM behavior via `useSandboxScenarioLive`.
 *
 * Flow (Tainan's BYOC design):
 *   Step 1 — the learner writes their OWN context/input and sends → the REAL AI
 *            responder (`/v1/embed/respond`) generates a genuine answer.
 *   Step 2 — the learner rates that answer good/bad (2 buttons) → the JUDGE
 *            (`/v1/embed/judge`) returns its real-LLM verdict on the response,
 *            and the client compares (rating × verdict) → PASS / FAIL, showing
 *            the judge's WHY. A wrong rating can be reconsidered (retry). On a
 *            pass (or an unverifiable judge) an explicit "Continuar" fires
 *            `onComplete(true)`. Honors `reveal` (live-class mode).
 */
import { useEffect, useState } from 'react';
import { ArrowUp, CheckCircle2, MessageSquare, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { t, type Locale } from '@iterahq/activity-spec/runtime';
import { useI18n } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import type { Activity } from '@/types/content';
import { ActivityShell } from '@/components/branded/activity/parts';
import { SandboxChatLog } from '@/components/branded/activity/sandbox/SandboxChatLog';
import { SandboxBubble } from '@/components/branded/activity/sandbox/SandboxBubble';
import { useAssistantStream } from '@/components/branded/activity/sandbox/useAssistantStream';
import { useSandboxScenarioLive } from './useSandboxScenarioLive';
import type { ByocLiveSpec } from './byocLive';

export function SandboxScenarioLiveActivity({
  activity,
  onComplete,
  reveal = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  /** Reveal the success state (timer stopped/expired) even without a submission. */
  reveal?: boolean;
}) {
  const { t: tr, locale } = useI18n();
  const { session } = useAuth();
  const token = session?.access_token ?? '';
  const spec = (activity.spec ?? {}) as ByocLiveSpec;
  const isDone = activity.status === 'done';

  const s = useSandboxScenarioLive(activity.id, spec, token, locale as Locale, reveal, isDone);
  const stream = useAssistantStream(s.messages);
  const [input, setInput] = useState('');

  // The eval buttons appear only AFTER the latest response has finished
  // typewriter-streaming (so the learner reads the whole answer first, and to
  // avoid a 1-frame flash of the buttons before useAssistantStream kicks in).
  // `streamedOnce` flips true once streaming has started for the current reply
  // and is reset on each new send.
  const [streamedOnce, setStreamedOnce] = useState(false);
  useEffect(() => {
    if (stream.active) setStreamedOnce(true);
  }, [stream.active]);

  const tx = (bag: { pt: string; en: string }) => t(bag, locale as Locale);
  const composePrompt = spec.prompt
    ? t(spec.prompt, locale as Locale)
    : tx({ pt: 'Escreva seu próprio contexto e envie — a IA vai responder de verdade.', en: 'Write your own context and send — the AI will really respond.' });
  const placeholder = spec.placeholder
    ? t(spec.placeholder, locale as Locale)
    : tx({ pt: 'escreva seu contexto/pedido…', en: 'write your context/ask…' });
  const ratePrompt = spec.ratePrompt
    ? t(spec.ratePrompt, locale as Locale)
    : tx({ pt: 'Essa resposta foi boa ou ruim?', en: 'Was this response good or bad?' });
  const goodLabel = spec.goodLabel ? t(spec.goodLabel, locale as Locale) : tx({ pt: 'Boa', en: 'Good' });
  const badLabel = spec.badLabel ? t(spec.badLabel, locale as Locale) : tx({ pt: 'Ruim', en: 'Bad' });

  const readOnly = reveal || isDone;
  const showContinue = s.won;
  const canSend = input.trim() !== '' && s.phase === 'compose' && !readOnly;

  function doSend() {
    if (!canSend) return;
    setStreamedOnce(false);
    s.send(input);
    setInput('');
  }

  return (
    <ActivityShell kind="sandbox_scenario" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      <div className="flex h-[68dvh] min-h-[380px] flex-col" data-testid="byoc-live" data-openness="byoc">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="byoc-scroll">
          <SandboxChatLog
            messages={s.messages}
            streamIndex={stream.streamIndex}
            dots={stream.dots}
            revealed={stream.revealed}
          />

          {/* Step-1 "AI is thinking" — the real responder call is in flight and no
              assistant message exists yet, so useAssistantStream can't animate it. */}
          {s.phase === 'responding' && (
            <div className="pt-3" data-testid="byoc-responding">
              <SandboxBubble role="assistant" text="" dots />
            </div>
          )}
        </div>

        <div className="shrink-0 pt-4">
          {/* Non-fatal degrade note — never hard-blocks the learner. */}
          {!s.responderAvailable && s.phase !== 'compose' && (
            <p className="mb-2 text-xs text-muted-foreground" data-testid="byoc-responder-degraded">
              {tx({ pt: 'A IA respondeu em modo degradado.', en: 'The AI answered in degraded mode.' })}
            </p>
          )}

          {/* Compose (step 1) */}
          {s.phase === 'compose' && !readOnly && (
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-medium text-foreground">{composePrompt}</p>
              <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-obsidiana p-2 pl-4 shadow-inner">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter (without Shift) submits AND clears the field (doSend
                  // clears via setInput('')); Shift+Enter keeps the multiline
                  // newline. `isComposing` guards IME composition so confirming
                  // a candidate with Enter never submits mid-composition.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    doSend();
                  }
                }}
                rows={2}
                placeholder={placeholder}
                data-testid="byoc-input"
                className="flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={doSend}
                data-testid="byoc-send"
                aria-label={tx({ pt: 'Enviar', en: 'Send' })}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-evergreen text-obsidiana transition-colors hover:bg-evergreen-hi disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
              </div>
            </div>
          )}

          {/* Evaluate (step 2) — two buttons: good / bad. Held back until the
              streamed response has fully surfaced, so the learner reads the whole
              answer before judging it. */}
          {s.phase === 'evaluate' && !readOnly && streamedOnce && !stream.active && (
            <div className="flex flex-col gap-3" data-testid="byoc-eval">
              <p className="text-[15px] font-medium text-foreground">{ratePrompt}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => s.rate('good')}
                  data-testid="byoc-rate-good"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-evergreen/50"
                >
                  <ThumbsUp className="h-5 w-5 text-menta" /> {goodLabel}
                </button>
                <button
                  type="button"
                  onClick={() => s.rate('bad')}
                  data-testid="byoc-rate-bad"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-destructive/50"
                >
                  <ThumbsDown className="h-5 w-5 text-destructive" /> {badLabel}
                </button>
              </div>
            </div>
          )}

          {/* Judging — the judge call is in flight. */}
          {s.phase === 'judging' && (
            <p className="text-sm text-muted-foreground" data-testid="byoc-judging">
              {tx({ pt: 'Avaliando sua resposta…', en: 'Checking your rating…' })}
            </p>
          )}

          {/* Settled — outcome + the judge's WHY. */}
          {s.phase === 'settled' && (
            <div
              className="flex flex-col gap-3"
              data-testid="byoc-outcome"
              data-outcome={s.outcome ?? undefined}
              data-judge-verdict={s.judgePassed === null ? undefined : s.judgePassed ? 'good' : 'bad'}
              data-learner-rating={s.rating ?? undefined}
            >
              <div
                className={`rounded-2xl border p-4 ${
                  s.outcome === 'pass'
                    ? 'border-menta/40 bg-menta/10'
                    : s.outcome === 'fail'
                      ? 'border-destructive/40 bg-destructive/10'
                      : 'border-border bg-card'
                }`}
              >
                <div
                  className={`mb-1 font-mono text-[11px] uppercase tracking-wider ${
                    s.outcome === 'pass' ? 'text-menta' : s.outcome === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                  data-testid="byoc-outcome-label"
                >
                  {s.outcome === 'pass'
                    ? tx({ pt: 'Você avaliou certo', en: 'You judged it right' })
                    : s.outcome === 'fail'
                      ? tx({ pt: 'Não foi dessa vez', en: 'Not this time' })
                      : tx({ pt: 'Registrado', en: 'Recorded' })}
                </div>
                {s.feedback && (
                  <p className="text-sm leading-relaxed text-foreground" data-testid="byoc-feedback">
                    {s.feedback}
                  </p>
                )}
              </div>

              {s.outcome === 'fail' && !readOnly && (
                <button
                  type="button"
                  onClick={s.retry}
                  data-testid="byoc-retry"
                  className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-evergreen px-5 py-2.5 font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
                >
                  <RotateCcw className="h-4 w-4" /> {tx({ pt: 'Tentar de novo', en: 'Try again' })}
                </button>
              )}
            </div>
          )}

          {showContinue && (
            <button
              type="button"
              onClick={() => onComplete(true)}
              data-testid="byoc-continue"
              data-locked={isDone ? 'true' : undefined}
              className={`mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-medium transition-colors ${
                isDone
                  ? 'cursor-default border border-menta/40 bg-menta/15 text-menta'
                  : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isDone ? tr('activity.done') : tr('activity.continue')}
            </button>
          )}
        </div>
      </div>
    </ActivityShell>
  );
}

export default SandboxScenarioLiveActivity;
