import { useState } from 'react';

/** The art of what was bought. The frame appears with the picture, never before it: a bordered empty square read as broken. */
export function PurchaseArt({ src }: { src: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (state === 'failed') return null;
  return (
    <img
      src={src}
      alt=""
      width={84}
      height={84}
      data-testid="purchase-art"
      data-loaded={state === 'loaded'}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
      className={`h-[84px] w-[84px] rounded-[10px] transition-opacity duration-300 ${state === 'loaded' ? 'border border-[#262320] opacity-100' : 'opacity-0'}`}
    />
  );
}
