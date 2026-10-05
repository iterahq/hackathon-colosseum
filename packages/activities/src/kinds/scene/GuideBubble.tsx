import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GuideAvatar } from './GuideAvatar.js';

/**
 * The guide speaks: `prompt` before the gesture, `reaction` (green accent) after
 * it. `sizers` are every text the bubble can show: all stay mounted, invisible,
 * in the same grid cell so the box is as tall as the tallest and the swap (or its
 * exit phase) never moves the page.
 *
 * On a phone the avatar leaves its column and sits small in the bubble's header,
 * next to the name, so the line he speaks runs the whole width of the card.
 */
/** A guide with no name has no header line: the first lines of his text make room for the face. */
const AVATAR_ROOM = 'float-left h-6 w-9 sm:hidden';
const HEADER = 'mb-1 block text-[10px] font-mono tracking-[.25em] uppercase max-sm:mb-1.5 max-sm:flex max-sm:h-7 max-sm:items-center max-sm:pl-10';

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
    <div className="relative flex items-end gap-3" data-testid="scene-guide" data-happy={happy ? 'true' : 'false'}>
      <GuideAvatar happy={happy} className="max-sm:absolute max-sm:left-4 max-sm:top-2.5 max-sm:z-10 max-sm:h-7 max-sm:w-7" />
      <div aria-live="polite" className="min-w-0 max-sm:flex-1">
        <div
          className={`relative grid max-w-xl rounded-2xl rounded-bl-sm border border-l-[3px] bg-[#1A1714] px-5 py-3.5 text-[15px] leading-relaxed text-foreground transition-colors duration-200 max-sm:rounded-bl-2xl max-sm:px-4 max-sm:py-2.5 max-sm:leading-snug [&>*]:col-start-1 [&>*]:row-start-1 ${
            happy ? 'border-evergreen/60' : 'border-white/10'
          }`}
        >
          {[...new Set([text, ...(sizers ?? [])])].map((sizer) => (
            <div key={sizer} aria-hidden className="invisible">
              {name ? <span className={HEADER}>{name}</span> : <span className={AVATAR_ROOM} />}
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
              {name ? <span className={`${HEADER} opacity-60`}>{name}</span> : <span className={AVATAR_ROOM} />}
              <span data-testid="scene-guide-text">{text}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
