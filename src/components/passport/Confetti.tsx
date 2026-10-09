import { motion } from 'framer-motion';

const COLORS = ['#F2C66D', '#3FD17F', '#B8913A'];
const COUNT = 24;

/** 24 SVG rectangles falling for 1.2 s; positions are fixed so a render is deterministic. */
export function Confetti({ accent }: { accent: string }) {
  const palette = [accent, ...COLORS];
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" data-testid="confetti">
      {Array.from({ length: COUNT }, (_, i) => (
        <motion.rect
          key={i}
          x={`${(i * 37) % 100}%`}
          y={-16}
          width={8}
          height={14}
          rx={1.5}
          fill={palette[i % palette.length]}
          initial={{ y: -16, rotate: 0, opacity: 1 }}
          animate={{ y: 900, rotate: 180 + ((i * 53) % 270), opacity: [1, 1, 0] }}
          transition={{ duration: 1.2, delay: (i % 6) * 0.05, ease: 'easeIn' }}
        />
      ))}
    </svg>
  );
}
