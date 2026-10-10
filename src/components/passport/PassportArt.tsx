import { useEffect, useState, type ComponentProps } from 'react';
import { PassportPage } from './PassportPage';

type Props = ComponentProps<typeof PassportPage> & { src?: string | null };

/**
 * The server-drawn art of a real row. A new `src` (another language, a new stamp) is loaded behind the
 * picture already on screen and swapped in when ready; the first load shows a quiet placeholder of the
 * art's shape. Our own SVG page is only for no row at all, or an art that failed.
 */
export function PassportArt({ src, ...page }: Props) {
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!src) setShown(null);
  }, [src]);
  const width = page.width ?? 300;
  const alt = `${page.title}: ${page.done}/${page.total}`;
  if (!src || (failed === src && !shown)) return <PassportPage {...page} />;
  const pending = src !== shown && failed !== src;
  return (
    <div className="relative max-w-full shrink-0" style={{ width }}>
      {shown ? (
        <img src={shown} alt={alt} width={width} data-testid="passport-art" className="h-auto w-full rounded-2xl" />
      ) : (
        <div data-testid="passport-art-loading" aria-hidden className="aspect-square w-full animate-pulse rounded-2xl bg-[#141210] motion-reduce:animate-none" />
      )}
      {pending && (
        <img
          src={src}
          alt=""
          aria-hidden
          onLoad={() => setShown(src)}
          onError={() => setFailed(src)}
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        />
      )}
    </div>
  );
}
