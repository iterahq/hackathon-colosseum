import { AnimatePresence, motion } from "framer-motion";
import { TeraAvatar } from "@iterahq/activities";

export function TeraBubble({ text, happy }: { text: string; happy: boolean }) {
  return (
    <div className="flex items-end gap-3">
      <TeraAvatar mood={happy ? "happy" : "neutral"} />
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={`relative max-w-xl rounded-2xl rounded-bl-sm px-5 py-3.5 text-[15px] leading-relaxed ${
            happy ? "bg-[#3FD17F] text-brand-bg" : "bg-[#1A1714] text-white/90 border border-white/10"
          }`}
        >
          <span className="block text-[10px] font-mono tracking-[.25em] uppercase opacity-60 mb-1">Tera</span>
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
