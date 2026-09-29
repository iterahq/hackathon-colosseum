import { AnimatePresence, motion } from 'framer-motion';

/** The live wire between a page element and its source line. */
export function ConnectorWire({ path, id }: { path: string | null; id: string | null }) {
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible hidden md:block" aria-hidden="true">
      <AnimatePresence>
        {path && (
          <motion.path
            key={id ?? 'wire'}
            d={path}
            fill="none"
            stroke="#3FD17F"
            strokeWidth={2}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{ filter: 'drop-shadow(0 0 6px #3FD17F)' }}
          />
        )}
      </AnimatePresence>
    </svg>
  );
}
