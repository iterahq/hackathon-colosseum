import { motion } from 'framer-motion';

/** The day chest, drawn in the app's chunky outline. `open`: the lid is up and the light of `color` comes out. */
export function ChestArt({ open, color, shaking = false, still = false, size = 72 }: { open: boolean; color: string; shaking?: boolean; still?: boolean; size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-hidden
      data-testid="chest-art"
      data-open={open}
      animate={shaking && !still ? { rotate: [0, -4, 4, -3, 3, 0] } : { rotate: 0 }}
      transition={shaking && !still ? { duration: 0.5, repeat: Infinity, repeatDelay: 0.25 } : { duration: 0 }}
    >
      {open && <path d="M14 34 L6 4 H66 L58 34 Z" fill={color} opacity="0.22" />}
      <motion.g style={{ transformOrigin: '12px 32px' }} initial={false} animate={{ rotate: open ? -38 : 0 }} transition={{ duration: still ? 0 : 0.28, ease: 'easeOut' }}>
        <path d="M12 32 V25 a10 10 0 0 1 10 -10 H50 a10 10 0 0 1 10 10 V32 Z" fill="#1C1916" stroke="#5E574E" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M24 15 V32 M48 15 V32" stroke="#5E574E" strokeWidth="2.5" />
      </motion.g>
      <path d="M12 32 H60 V54 a5 5 0 0 1 -5 5 H17 a5 5 0 0 1 -5 -5 Z" fill="#141210" stroke="#5E574E" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 32 V59 M48 32 V59" stroke="#5E574E" strokeWidth="2.5" />
      <path d="M12 62.5 H60" stroke="#262320" strokeWidth="3" strokeLinecap="round" />
      <rect x="31" y="29" width="10" height="12" rx="2.5" fill={color} stroke="#0A0908" strokeWidth="1.5" />
      <circle cx="36" cy="34.5" r="1.6" fill="#0A0908" />
    </motion.svg>
  );
}
