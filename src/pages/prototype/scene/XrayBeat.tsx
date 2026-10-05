import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SceneBeatProps } from "@/types/scenePrototype";
import { TERA_PAGE_BACKGROUND } from "./teraElements";
import { XrayRows } from "./XrayRows";
import { COVERAGE_GOAL, useXrayScan } from "./useXrayScan";

const LENS_RADIUS = 96;

export function XrayBeat({ solved, onSolved }: SceneBeatProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { lens, coverage, scan, clearLens } = useXrayScan(stageRef, solved, onSolved);

  const mask = lens
    ? `radial-gradient(circle ${LENS_RADIUS}px at ${lens.x}px ${lens.y}px, transparent 0 ${LENS_RADIUS - 2}px, #000 ${LENS_RADIUS}px)`
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stageRef}
        onPointerMove={scan}
        onPointerDown={scan}
        onPointerLeave={clearLens}
        className="relative w-full aspect-4/5 sm:aspect-video max-h-[460px] rounded-2xl overflow-hidden select-none"
        style={{ touchAction: "none", cursor: lens ? "none" : "crosshair", boxShadow: "0 30px 80px -30px rgba(0,0,0,.8)" }}
      >
        {/* Bottom layer: the text the browser actually reads. */}
        <div
          className="absolute inset-0"
          style={{
            background: "#0E0D0B",
            backgroundImage:
              "linear-gradient(rgba(63,209,127,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(63,209,127,.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <XrayRows layer="code" />
        </div>

        {/* Top layer: what the browser draws. The lens punches a hole in it. */}
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: solved ? 0 : 1 }}
          transition={{ duration: 0.9, delay: solved ? 0.5 : 0 }}
          style={{ background: TERA_PAGE_BACKGROUND, WebkitMaskImage: mask, maskImage: mask }}
        >
          <div className="absolute top-0 inset-x-0 h-8 flex items-center gap-1.5 px-3 bg-white/60 border-b border-black/5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-[11px] text-black/40 font-mono">tera.site</span>
          </div>
          <XrayRows layer="page" />
        </motion.div>

        {lens && !solved && (
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: lens.x - LENS_RADIUS,
              top: lens.y - LENS_RADIUS,
              width: LENS_RADIUS * 2,
              height: LENS_RADIUS * 2,
              boxShadow: "0 0 0 2px #3FD17F, 0 0 40px 6px rgba(63,209,127,.45), inset 0 0 30px rgba(63,209,127,.25)",
            }}
          >
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-[.3em] text-[#3FD17F] font-mono">
              RAIO-X
            </span>
          </div>
        )}

        <AnimatePresence>
          {!lens && !solved && coverage === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <motion.div
                animate={{ x: [-60, 60, -60], y: [0, -18, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                className="h-20 w-20 rounded-full border-2 border-[#3FD17F] shadow-[0_0_30px_rgba(63,209,127,.5)] bg-[#0E0D0B]/10 backdrop-blur-[1px]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-[#3FD17F]"
            animate={{ width: `${Math.min(1, coverage / COVERAGE_GOAL) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <span className="font-mono text-xs text-white/50 w-24 text-right">
          {solved ? "escaneado" : `${Math.round(Math.min(1, coverage / COVERAGE_GOAL) * 100)}% escaneado`}
        </span>
      </div>
    </div>
  );
}
