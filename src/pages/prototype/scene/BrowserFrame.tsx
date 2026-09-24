import { motion } from "framer-motion";
import { DUDA_ELEMENTS, DUDA_PAGE_BACKGROUND } from "./dudaElements";
import { RenderedElement } from "./RenderedElement";

/** Duda's page in a browser window; the h1 pops every time it changes. */
export function BrowserFrame({ h1Text }: { h1Text: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-black/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]" style={{ background: DUDA_PAGE_BACKGROUND }}>
      <div className="h-9 flex items-center gap-1.5 px-3 bg-white/70 border-b border-black/5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="ml-3 flex-1 rounded-md bg-black/5 px-2 py-0.5 text-[11px] text-black/40 font-mono">duda.site</span>
      </div>
      <div className="flex flex-col gap-4 p-7 min-h-[230px]">
        {DUDA_ELEMENTS.map((element) =>
          element.id === "h1" ? (
            <motion.div
              key={`h1-${h1Text.length}`}
              initial={{ scale: 1.04, filter: "brightness(1.25)" }}
              animate={{ scale: 1, filter: "brightness(1)" }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              style={{ transformOrigin: "left center" }}
            >
              <RenderedElement element={element} text={h1Text || " "} />
            </motion.div>
          ) : (
            <div key={element.id}>
              <RenderedElement element={element} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
