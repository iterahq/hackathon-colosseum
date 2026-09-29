import { motion } from 'framer-motion';

export function ScanMeter({ progress, label }: { progress: number; label: string }) {
  return (
    <div
      className="flex items-center gap-3"
      data-testid="xray-meter"
      data-progress={Math.round(progress * 100)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full bg-evergreen"
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground w-28 text-right">{label}</span>
    </div>
  );
}
