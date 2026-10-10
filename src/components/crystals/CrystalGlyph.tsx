/** The Phoenix Crystal: a small faceted gem, drawn in SVG and tinted by `currentColor`. */
export function CrystalGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.5 19.5 9 12 21.5 4.5 9Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M4.5 9h15M9 9l3-6.5L15 9M9 9l3 12.5M15 9l-3 12.5" />
    </svg>
  );
}
