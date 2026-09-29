export const XRAY_LENS_RADIUS = 96;

/** The glowing ring drawn where the pointer is. */
export function XrayLens({ x, y, label }: { x: number; y: number; label: string }) {
  const r = XRAY_LENS_RADIUS;
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        boxShadow: '0 0 0 2px #3FD17F, 0 0 40px 6px rgba(63,209,127,.45), inset 0 0 30px rgba(63,209,127,.25)',
      }}
    >
      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-[.3em] text-evergreen font-mono uppercase">
        {label}
      </span>
    </div>
  );
}
