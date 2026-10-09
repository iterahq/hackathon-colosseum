import { useEffect, useState, type ComponentProps } from 'react';
import { PassportPage } from './PassportPage';

type Props = ComponentProps<typeof PassportPage> & { src?: string | null };

/** The server-drawn art of a real row; our own SVG page while it loads, when there is no row, or when it fails. */
export function PassportArt({ src, ...page }: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => setState('loading'), [src]);
  const width = page.width ?? 300;
  const alt = `${page.title}: ${page.done}/${page.total}`;
  if (!src || state === 'failed') return <PassportPage {...page} />;
  return (
    <div className="relative max-w-full shrink-0" style={{ width }}>
      {state === 'loading' && <PassportPage {...page} />}
      <img
        src={src}
        alt={alt}
        width={width}
        data-testid="passport-art"
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
        className={`h-auto w-full rounded-2xl ${state === 'ready' ? '' : 'absolute left-0 top-0 opacity-0'}`}
      />
    </div>
  );
}
