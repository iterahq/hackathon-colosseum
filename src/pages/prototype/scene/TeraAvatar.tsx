import { motion } from "framer-motion";

/** Tera, the Itera phoenix — bobs while talking and beams when the learner nails it. */
export function TeraAvatar({ happy }: { happy: boolean }) {
  return (
    <motion.span
      aria-hidden="true"
      className="relative block h-16 w-16 shrink-0 drop-shadow-[0_8px_16px_rgba(63,209,127,.35)]"
      animate={happy ? { rotate: [0, -8, 8, 0], y: [0, -6, 0] } : { y: [0, -2, 0] }}
      transition={happy ? { duration: 0.6 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <img
        src={happy ? "/mascot/tera-happy.webp" : "/mascot/tera-neutral.webp"}
        alt=""
        draggable={false}
        className="absolute bottom-0 left-0 w-full max-w-none select-none"
      />
    </motion.span>
  );
}
