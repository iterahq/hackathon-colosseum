import { motion } from "framer-motion";

/** The concept's name lands like a rubber stamp — only after the gesture. */
export function ConceptStamp({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ scale: 2.4, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: -3, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 16 }}
      className="inline-block rounded-lg border-[3px] border-[#3FD17F] px-5 py-2 text-[#3FD17F] shadow-[0_0_40px_rgba(63,209,127,.35)]"
      style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: "clamp(22px,3vw,34px)", textTransform: "uppercase", letterSpacing: ".02em" }}
    >
      {text}
    </motion.div>
  );
}
