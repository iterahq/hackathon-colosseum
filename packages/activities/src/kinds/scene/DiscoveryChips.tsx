import { motion } from 'framer-motion';
import type { ScenePageElementSpec } from '../../specs.js';

/** The collection: one slot per element, filled with `<tag> = name` when found. */
export function DiscoveryChips({
  elements,
  found,
  nameOf,
}: {
  elements: ScenePageElementSpec[];
  found: ReadonlySet<string>;
  nameOf: (element: ScenePageElementSpec) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="inspect-chips" data-found={found.size}>
      {elements.map((element) => {
        const isFound = found.has(element.id);
        return (
          <motion.div
            key={element.id}
            layout
            animate={isFound ? { scale: [1, 1.15, 1] } : {}}
            data-testid="inspect-chip"
            data-found={isFound ? 'true' : 'false'}
            className={`rounded-full px-3 py-1.5 text-xs font-mono border ${
              isFound ? 'border-evergreen bg-evergreen/15 text-evergreen-hi' : 'border-dashed border-white/15 text-white/25'
            }`}
          >
            {isFound ? `<${element.tag}> = ${nameOf(element)}` : '? ? ?'}
          </motion.div>
        );
      })}
    </div>
  );
}
