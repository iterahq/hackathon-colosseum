import { useEffect, useState } from 'react';
import { TeraAvatar } from '@iterahq/activities';
import { useI18n } from '@/i18n';
import './TeraLoader.css';

type Size = 'sm' | 'md' | 'lg';

interface TeraLoaderProps {
  size?: Size;
  label?: string;
  fullScreen?: boolean;
  /** Fade in after 400 ms so a fast load shows nothing. */
  delayed?: boolean;
  className?: string;
  'data-testid'?: string;
}

const ORB: Record<Size, number> = { sm: 56, md: 110, lg: 150 };
const DASHES = 5;
const CAPTION_KEYS = ['preparing', 'wings', 'stamping', 'almost'] as const;
const STEP_MS = 480;
const FILL_MS = 2400;
const HAPPY_MS = 640;
const LOOP_MS = 3200;

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql?.addEventListener) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useLoaderBeat(active: boolean) {
  const [lit, setLit] = useState(0);
  const [happy, setHappy] = useState(false);
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < DASHES; i += 1) timers.push(setTimeout(() => setLit(i + 1), i * STEP_MS));
    timers.push(setTimeout(() => setHappy(true), FILL_MS));
    timers.push(
      setTimeout(() => {
        setHappy(false);
        setLit(0);
      }, FILL_MS + HAPPY_MS),
    );
    timers.push(setTimeout(() => setLoop((n) => n + 1), LOOP_MS));
    return () => timers.forEach(clearTimeout);
  }, [active, loop]);
  return { lit, happy, loop };
}

export function TeraLoader({
  size = 'md',
  label,
  fullScreen = false,
  delayed = false,
  className = '',
  'data-testid': testId = 'tera-loader',
}: TeraLoaderProps) {
  const { t } = useI18n();
  const reduced = usePrefersReducedMotion();
  const compact = size === 'sm';
  const beat = useLoaderBeat(!reduced && !compact);
  const lit = reduced ? 3 : beat.lit;
  const happy = !reduced && beat.happy;
  const caption = label ?? t(`tera.loading.${CAPTION_KEYS[beat.loop % CAPTION_KEYS.length]}`);
  const orb = ORB[size];
  const faceScale = (orb * 88) / 150 / 96;

  const wrapper = [
    'flex flex-col items-center justify-center gap-[22px]',
    fullScreen ? 'tera-loader-fullscreen fixed inset-0 z-50' : '',
    delayed ? 'tera-loader-delayed' : '',
    className,
  ].join(' ');

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      data-reduced-motion={reduced ? 'true' : 'false'}
      className={wrapper}
    >
      <div className="relative" style={{ width: orb, height: orb }}>
        <svg viewBox="0 0 150 150" className="absolute inset-0 overflow-visible" aria-hidden="true">
          <circle className="tera-loader-pulse" cx="75" cy="75" r="58" fill="none" stroke="#3FD17F" strokeWidth="2" />
          <circle cx="75" cy="75" r="58" fill="#141210" stroke="#262320" strokeWidth="2" />
          <circle
            className="tera-loader-ring"
            cx="75"
            cy="75"
            r="66"
            fill="none"
            stroke="#3FD17F"
            strokeWidth="3"
            strokeDasharray="10 9"
            strokeLinecap="round"
          />
        </svg>
        <div
          className="absolute left-1/2 h-24 w-24"
          style={{
            bottom: (orb * 26) / 150,
            marginLeft: -48,
            transform: `scale(${faceScale})`,
            transformOrigin: 'bottom center',
          }}
        >
          <TeraAvatar mood={happy ? 'happy' : 'neutral'} size="xl" />
        </div>
      </div>
      {!compact && (
        <div className="flex gap-2" data-testid="tera-loader-dashes" aria-hidden="true">
          {Array.from({ length: DASHES }, (_, i) => (
            <span
              key={i}
              data-on={i < lit ? 'true' : 'false'}
              className="h-2 w-[30px] rounded-[3px] transition-colors duration-200"
              style={{ backgroundColor: i < lit ? '#3FD17F' : '#2E2A25' }}
            />
          ))}
        </div>
      )}
      {compact || !caption ? (
        <span className="sr-only">{caption}</span>
      ) : (
        <p className="font-mono text-[13px] font-medium tracking-[0.02em] text-[#A0978A]">&gt; {caption}</p>
      )}
    </div>
  );
}
