import { motion } from "framer-motion";
import { TERA_ELEMENTS } from "./teraElements";
import type { TeraElementId } from "@/types/scenePrototype";

/** The learner's collection: one slot per element, filled when found. */
export function DiscoveryChips({ found }: { found: Set<TeraElementId> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TERA_ELEMENTS.map((element) => {
        const isFound = found.has(element.id);
        return (
          <motion.div
            key={element.id}
            layout
            animate={isFound ? { scale: [1, 1.15, 1] } : {}}
            className={`rounded-full px-3 py-1.5 text-xs font-mono border ${
              isFound ? "border-[#3FD17F] bg-[#3FD17F]/15 text-[#62D996]" : "border-dashed border-white/15 text-white/25"
            }`}
          >
            {isFound ? `<${element.tag}> = ${element.name}` : "? ? ?"}
          </motion.div>
        );
      })}
    </div>
  );
}
