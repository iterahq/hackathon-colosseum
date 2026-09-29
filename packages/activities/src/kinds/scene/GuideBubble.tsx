import { AnimatePresence, motion } from 'framer-motion';
import { GuideAvatar } from './GuideAvatar.js';

/** The guide speaks: `prompt` before the gesture, `reaction` (green) after it. */
export function GuideBubble({ name, text, happy }: { name?: string; text: string; happy: boolean }) {
  return (
    <div className="flex items-end gap-3" data-testid="scene-guide" data-happy={happy ? 'true' : 'false'}>
      <GuideAvatar happy={happy} />
      <div aria-live="polite" className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={text}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className={`relative max-w-xl rounded-2xl rounded-bl-sm px-5 py-3.5 text-[15px] leading-relaxed ${
              happy ? 'bg-evergreen text-[#0A0908]' : 'bg-[#1A1714] text-white/90 border border-white/10'
            }`}
          >
            {name && (
              <span className="block text-[10px] font-mono tracking-[.25em] uppercase opacity-60 mb-1">{name}</span>
            )}
            <span data-testid="scene-guide-text">{text}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
