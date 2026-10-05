import { AnimatePresence, motion } from "framer-motion";

/** The gap between editor and browser: every keystroke travels across it. */
export function SparkWire({ sparks }: { sparks: number[] }) {
  return (
    <div className="relative hidden md:flex w-14 items-center justify-center">
      <div className="h-px w-full bg-linear-to-r/srgb from-[#3FD17F]/10 via-[#3FD17F]/40 to-[#3FD17F]/10" />
      <AnimatePresence>
        {sparks.map((id) => (
          <motion.span
            key={id}
            initial={{ x: -28, opacity: 0, scale: 0.4 }}
            animate={{ x: 28, opacity: [0, 1, 0], scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute h-2 w-2 rounded-full bg-[#3FD17F] shadow-[0_0_12px_#3FD17F]"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
