import { motion } from "framer-motion";

export function SceneProgress({ total, current, solved }: { total: number; current: number; solved: boolean }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const fill = i < current || (i === current && solved) ? 1 : i === current ? 0.35 : 0;
        return (
          <div key={i} className="h-1.5 w-14 rounded-full bg-white/10 overflow-hidden">
            <motion.div className="h-full bg-[#3FD17F]" animate={{ width: `${fill * 100}%` }} transition={{ duration: 0.5 }} />
          </div>
        );
      })}
    </div>
  );
}
