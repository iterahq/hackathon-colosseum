/**
 * `bucket` — a scene-mechanics kind (2026-09-25, plan
 * `20260924-itera-scene-mechanics-kinds`, batch B).
 *
 * Ports `BucketBeat` (`itera-cenas-a1f3/_src/src/mechanics/BucketBeat.tsx`).
 * Pick a chip, then tap the bucket it belongs to — pick-then-tap instead of
 * drag, so the gesture is identical with a pointer or a finger. A wrong
 * bucket bounces the chip back and shows its own `hint`; the beat completes
 * once every chip is placed.
 *
 * ⚠️ Mirrors `@iterahq/activity-spec` read shape locally (`BucketSpec` in
 * `../specs.js`) — see the release-gate note at the top of that section.
 */
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useActivityI18n } from '../context.js';
import type { ActivityCompleteHandler, PortableActivity } from '../renderer.js';
import type { BucketSpec, BucketTone } from '../specs.js';
import { SceneFrame } from './scene/SceneFrame.js';
import { useSceneGate } from './scene/useSceneGate.js';
import { useSceneText } from './scene/useSceneText.js';
import { useWrongHint } from './scene/useWrongHint.js';
import { WrongHint } from './scene/WrongHint.js';
import { TOUCH_SURFACE } from '../components/touchSurface.js';

const TONE_HEX: Record<BucketTone, string> = {
  blue: '#3B82F6',
  green: '#3FD17F',
  yellow: '#F2C66D',
  purple: '#C084FC',
  orange: '#E07A4A',
  pink: '#DB2777',
  red: '#EF4444',
  gray: '#9CA3AF',
};

export function BucketActivity({ activity, onComplete }: { activity: PortableActivity; onComplete: ActivityCompleteHandler }) {
  const { t } = useActivityI18n();
  const spec = activity.spec as unknown as BucketSpec;
  const copy = useSceneText(spec);
  const gate = useSceneGate(activity, onComplete);
  const { record, open, solved, step } = gate;
  const reducedMotion = useReducedMotion();

  // A `done` activity opens with every chip in its bucket: review shows the answer, not an empty tray.
  const [placed, setPlaced] = useState<Record<string, string>>(() =>
    activity.status === 'done' ? Object.fromEntries((spec?.chips ?? []).map((chip) => [chip.id, chip.bucket])) : {},
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [shaking, setShaking] = useState<string | null>(null);
  const { showHint, clearHint, hintProps } = useWrongHint();

  const chips = spec?.chips ?? [];
  const buckets = spec?.buckets ?? [];
  const pending = chips.filter((chip) => !placed[chip.id]);

  const pick = (chipId: string) => {
    if (solved) return;
    if (picked !== chipId) step('pick');
    setPicked((current) => (current === chipId ? null : chipId));
  };

  const drop = (bucketId: string) => {
    if (!picked || solved) return;
    const chip = chips.find((c) => c.id === picked);
    if (!chip) return;
    if (chip.bucket !== bucketId) {
      setShaking(bucketId);
      window.setTimeout(() => setShaking(null), 500);
      record('wrong_try', { chip_id: chip.id, bucket_id: bucketId });
      showHint(copy.text(chip.hint));
      step('wrong');
      return;
    }
    const next = { ...placed, [picked]: bucketId };
    setPlaced(next);
    setPicked(null);
    clearHint();
    record('chip_placed', { chip_id: chip.id, bucket_id: bucketId });
    if (Object.keys(next).length === chips.length) open({ chips: Object.keys(next).length });
    step('drop');
  };

  return (
    <SceneFrame
      kind="bucket"
      icon={Boxes}
      label={t('activity.bucket')}
      guideName={copy.guideName}
      prompt={copy.prompt}
      reaction={copy.reaction}
      solved={solved}
    >
      <div className={`flex flex-col gap-5 ${TOUCH_SURFACE}`} data-testid="bucket-stage">
        <div
          className="flex flex-wrap gap-2 min-h-[52px] rounded-xl border border-dashed border-border p-3"
          data-testid="bucket-tray"
        >
          <AnimatePresence>
            {pending.map((chip) => (
              <motion.button
                key={chip.id}
                type="button"
                layout
                initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                data-testid={`bucket-chip-${chip.id}`}
                onClick={() => pick(chip.id)}
                aria-pressed={picked === chip.id}
                disabled={solved}
                className={`coarse:relative coarse:before:absolute coarse:before:-inset-y-[3px] coarse:before:inset-x-0 max-w-full rounded-full border px-4 py-2 text-left text-[15px] [overflow-wrap:anywhere] ${picked === chip.id ? 'border-evergreen bg-evergreen/15' : 'border-border bg-card hover:border-foreground/30'}`}
              >
                {copy.text(chip.label)}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        {/* Three columns on a phone are 100 px each: a chip of code does not fit, so three buckets stack there. */}
        <div
          className="grid gap-3 [grid-template-columns:repeat(var(--bucket-cols-phone),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--bucket-cols),minmax(0,1fr))]"
          style={
            {
              '--bucket-cols': Math.min(buckets.length || 1, 3),
              '--bucket-cols-phone': buckets.length >= 3 ? 1 : buckets.length || 1,
            } as CSSProperties
          }
          data-testid="bucket-drops"
        >
          {buckets.map((bucket) => {
            const hex = TONE_HEX[bucket.tone] ?? TONE_HEX.gray;
            const inside = chips.filter((chip) => placed[chip.id] === bucket.id);
            return (
              <motion.button
                key={bucket.id}
                type="button"
                data-testid={`bucket-drop-${bucket.id}`}
                animate={shaking === bucket.id && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                onClick={() => drop(bucket.id)}
                disabled={solved}
                className={`min-w-0 text-left rounded-2xl border-2 p-4 min-h-[150px] max-sm:min-h-[72px] max-sm:p-3 flex flex-col gap-2 transition-colors ${picked ? 'border-dashed cursor-pointer' : 'border-border'}`}
                style={{ borderColor: picked ? hex : undefined, background: `${hex}0D` }}
              >
                <span className="font-semibold uppercase text-sm [overflow-wrap:anywhere]" style={{ color: hex }}>
                  {copy.text(bucket.label)}
                </span>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {inside.map((chip) => (
                    <span
                      key={chip.id}
                      data-testid={`bucket-placed-${chip.id}`}
                      className="max-w-full rounded-2xl px-3 py-1 text-sm border [overflow-wrap:anywhere]"
                      style={{ borderColor: `${hex}66`, background: `${hex}22` }}
                    >
                      {copy.text(chip.label)}
                    </span>
                  ))}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
      {!solved && <WrongHint {...hintProps} />}
    </SceneFrame>
  );
}
