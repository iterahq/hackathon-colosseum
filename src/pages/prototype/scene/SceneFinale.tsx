import { motion } from "framer-motion";
import { TeraAvatar } from "@iterahq/activities";

const CONFETTI = Array.from({ length: 28 }, (_, i) => i);
const COLORS = ["#3FD17F", "#E07A4A", "#DB2777", "#F2C66D"];

export function SceneFinale({ onReplay }: { onReplay: () => void }) {
  return (
    <div className="relative flex flex-col items-center text-center gap-6 py-16 overflow-hidden">
      {CONFETTI.map((i) => (
        <motion.span
          key={i}
          className="absolute top-0 h-2.5 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: 520, rotate: 360 + i * 40, opacity: 0 }}
          transition={{ duration: 2.2 + (i % 5) * 0.3, delay: (i % 7) * 0.08, ease: "easeIn" }}
        />
      ))}
      <TeraAvatar mood="happy" />
      <h2 className="text-[clamp(36px,6vw,64px)] leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, textTransform: "uppercase" }}>
        Você leu HTML <span className="text-[#3FD17F]">de verdade</span>
      </h2>
      <p className="max-w-md text-white/60">
        Texto por baixo, editor à esquerda, navegador à direita, e cada peça com o nome da sua tag. Amanhã você monta a página inteira.
      </p>
      <button onClick={onReplay} className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 hover:bg-white/5">
        Ver de novo
      </button>
    </div>
  );
}
