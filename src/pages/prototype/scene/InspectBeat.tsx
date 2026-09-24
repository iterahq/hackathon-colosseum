import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DudaElementId, SceneBeatProps } from "@/types/scenePrototype";
import { DUDA_ELEMENTS, DUDA_PAGE_BACKGROUND } from "./dudaElements";
import { CodeLine } from "./CodeLine";
import { RenderedElement } from "./RenderedElement";
import { DiscoveryChips } from "./DiscoveryChips";
import { useConnectorPath } from "./useConnectorPath";
import { useDiscoveries } from "./useDiscoveries";

/**
 * Point at anything — on the page or in the code — and its twin lights up,
 * tied by a live wire. Finding all four is the gate.
 */
export function InspectBeat({ solved, onSolved }: SceneBeatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<DudaElementId, HTMLElement>());
  const codeRefs = useRef(new Map<DudaElementId, HTMLElement>());
  const { active, found, discover, release } = useDiscoveries(solved, onSolved);

  const path = useConnectorPath(
    containerRef,
    active ? pageRefs.current.get(active) ?? null : null,
    active ? codeRefs.current.get(active) ?? null : null,
  );

  const bind = (id: DudaElementId) => ({
    onPointerEnter: () => discover(id),
    onPointerDown: () => discover(id),
    onPointerLeave: release,
  });

  const activeElement = DUDA_ELEMENTS.find((element) => element.id === active);

  return (
    <div className="flex flex-col gap-5">
      <div ref={containerRef} className="relative grid md:grid-cols-2 gap-10 md:gap-16">
        <div className="rounded-xl p-7 flex flex-col gap-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]" style={{ background: DUDA_PAGE_BACKGROUND }}>
          {DUDA_ELEMENTS.map((element) => (
            <div
              key={element.id}
              ref={(node) => node && pageRefs.current.set(element.id, node)}
              {...bind(element.id)}
              className="self-start rounded-md px-2 py-1 -mx-2 transition-all duration-200 cursor-help"
              style={{ outline: active === element.id ? "2px solid #3FD17F" : "2px solid transparent", background: active === element.id ? "rgba(63,209,127,.12)" : undefined }}
            >
              <RenderedElement element={element} />
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-[#0E0D0B] border border-white/10 p-6 flex flex-col justify-center gap-4 text-[clamp(12px,1.3vw,15px)]">
          {DUDA_ELEMENTS.map((element) => (
            <div
              key={element.id}
              ref={(node) => node && codeRefs.current.set(element.id, node)}
              {...bind(element.id)}
              className="self-start rounded-md px-2 py-1.5 -mx-2 transition-all duration-200 cursor-help"
              style={{
                background: active === element.id ? "rgba(63,209,127,.14)" : undefined,
                opacity: active && active !== element.id ? 0.35 : 1,
              }}
            >
              <CodeLine element={element} />
            </div>
          ))}
        </div>

        <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible hidden md:block">
          <AnimatePresence>
            {path && (
              <motion.path
                key={active}
                d={path}
                fill="none"
                stroke="#3FD17F"
                strokeWidth={2}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ filter: "drop-shadow(0 0 6px #3FD17F)" }}
              />
            )}
          </AnimatePresence>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 min-h-[34px]">
        <DiscoveryChips found={found} />
        <AnimatePresence mode="wait">
          {activeElement && (
            <motion.span
              key={activeElement.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-white/70"
            >
              <span className="text-[#3FD17F] font-mono">&lt;{activeElement.tag}&gt;</span> é {activeElement.job}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
