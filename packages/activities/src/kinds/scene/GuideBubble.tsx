import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GuideAvatar } from './GuideAvatar.js';

/**
 * The guide speaks: `prompt` before the gesture, `reaction` (green accent) after
 * it. `sizers` are every text the bubble can show: all stay mounted, invisible,
 * in the same grid cell so the box is as tall as the tallest and the swap (or its
 * exit phase) never moves the page.
 */
export function GuideBubble({
  name,
  text,
  sizers,
  happy,
}: {
  name?: string;
  text: string;
  sizers?: string[];
  happy: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="flex items-end gap-3" data-testid="scene-guide" data-happy={happy ? 'true' : 'false'}>
      <GuideAvatar happy={happy} />
      <div aria-live="polite" className="min-w-0">
        <div
          className={`relative grid max-w-xl rounded-2xl rounded-bl-sm border border-l-[3px] bg-[#1A1714] px-5 py-3.5 text-[15px] leading-relaxed text-foreground transition-colors duration-200 [&>*]:col-start-1 [&>*]:row-start-1 ${
            happy ? 'border-evergreen/60' : 'border-white/10'
          }`}
        >
          {[...new Set([text, ...(sizers ?? [])])].map((sizer) => (
            <div key={sizer} aria-hidden className="invisible">
              {name && <span className="mb-1 block text-[10px] font-mono tracking-[.25em] uppercase">{name}</span>}
              <span>{sizer}</span>
            </div>
          ))}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={text}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {name && <span className="mb-1 block text-[10px] font-mono tracking-[.25em] uppercase opacity-60">{name}</span>}
              <span data-testid="scene-guide-text">{text}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
