import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useActivityI18n } from '../../context.js';
import { GuideAvatar } from './GuideAvatar.js';
import { SPRING_POP, SPRING_SETTLE, TACTILE_CTA } from '../../components/tactile.js';
import { usePublishedHeight } from '../../components/usePublishedHeight.js';

/**
 * The feedback a wrong try shows — `wire.wrong_hint`, `spot.miss_hint`,
 * `intercept.wrong_hint`, `press.wrong_hint` in the scene-mechanics batch. The
 * learner cannot fail: this never blocks a next try, it only explains the one
 * that just happened. A bottom bar, as bright as the success footer (the host's
 * verdict footer sits above it at z-50), with a "try again" that dismisses it.
 *
 * Shared across the batch so the look (and the `data-testid`) never drifts kind
 * to kind. The in-card `scene-wrong-hint` stays as an empty live region: zero
 * height, same text for screen readers. `nonce` lets a caller that keeps the
 * same text re-show a dismissed bar on a repeated miss.
 */
export type WrongHintTone = 'miss' | 'hit';

/** `tone="hit"` is for a note on a CORRECT step: the same bar, green instead of clay. */
export function WrongHint({
  text,
  nonce = 0,
  tone = 'miss',
}: {
  text: string | null;
  nonce?: number;
  tone?: WrongHintTone;
}) {
  const { t } = useActivityI18n();
  const reduced = useReducedMotion();
  const [dismissed, setDismissed] = useState<{ text: string; nonce: number } | null>(null);
  const visible = text !== null && text !== '' && !(dismissed?.text === text && dismissed.nonce === nonce);

  useEffect(() => {
    if (!text) setDismissed(null);
  }, [text]);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  usePublishedHeight(barRef, '--scene-hint-h', visible);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const dismiss = () => {
    if (text) setDismissed({ text, nonce });
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, text, nonce]);

  useEffect(() => {
    if (!visible) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      const back = returnFocusTo.current;
      returnFocusTo.current = null;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [visible, text, nonce]);

  const hit = tone === 'hit';

  return (
    <>
      <div className="sr-only" aria-live="polite" data-testid="scene-wrong-hint">
        {text}
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                key="wrong-bar"
                ref={barRef}
                data-testid="scene-wrong-bar"
                data-tone={tone}
                initial={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
                transition={SPRING_SETTLE}
                className={`fixed inset-x-0 bottom-0 z-40 border-t-2 ${hit ? 'border-evergreen/60' : 'border-clay/60'} bg-[#1C1916]/95 backdrop-blur-md`}
              >
                <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 max-sm:gap-3 max-sm:pt-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:flex-row md:items-center md:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <motion.span
                      initial={reduced ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING_POP}
                      className="mt-3 shrink-0 max-sm:mt-1"
                    >
                      <GuideAvatar happy={hit} oops={!hit} size="bar" className="max-sm:h-10 max-sm:w-10" />
                    </motion.span>
                    <div className="min-w-0">
                      <p className={`font-display text-xl font-bold ${hit ? 'text-evergreen-hi' : 'text-clay'}`}>
                        {t(hit ? 'activity.scene.hitTitle' : 'activity.scene.tryAgainTitle')}
                      </p>
                      <p className="text-base text-foreground/85">{text}</p>
                    </div>
                  </div>
                  <button
                    ref={buttonRef}
                    type="button"
                    onClick={dismiss}
                    data-testid="scene-try-again"
                    className={`h-12 w-full shrink-0 rounded-full px-8 md:w-auto ${
                      hit
                        ? TACTILE_CTA
                        : 'bg-clay font-semibold text-obsidiana shadow-[0_4px_0_#A8743F] transition-[transform,box-shadow] duration-100 active:translate-y-[3px] active:shadow-[0_1px_0_#A8743F]'
                    }`}
                  >
                    {t(hit ? 'activity.scene.gotIt' : 'activity.scene.tryAgain')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
