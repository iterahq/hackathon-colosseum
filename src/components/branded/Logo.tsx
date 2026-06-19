/**
 * Itera wordmark — Barlow Condensed 700, evergreen slash.
 * Ported from johnoak-itera/src/app/components/Logo.tsx.
 *
 * Supports per-tenant white-label: if a logoUrl is provided, render the image
 * instead of the wordmark (foundation #1 tenant branding stays intact).
 */
export function Logo({
  size = 28,
  withText = true,
  logoUrl,
  alt = 'Itera',
}: {
  size?: number;
  withText?: boolean;
  logoUrl?: string | null;
  alt?: string;
}) {
  if (logoUrl) {
    return <img src={logoUrl} alt={alt} style={{ height: size }} data-testid="tenant-logo" />;
  }
  const fontSize = withText ? size * 0.95 : size * 1.15;
  return (
    <div className="flex items-center select-none" aria-label="Itera" data-testid="itera-logo">
      <span
        className="font-display"
        style={{
          fontSize,
          fontWeight: 700,
          letterSpacing: '-2px',
          lineHeight: 1,
          color: 'var(--gelo, #F4EDE2)',
          textTransform: 'uppercase',
        }}
      >
        {withText ? 'ITERA' : 'I'}
        <span style={{ color: 'var(--verde-tech, #3FD17F)' }}>/</span>
      </span>
    </div>
  );
}
