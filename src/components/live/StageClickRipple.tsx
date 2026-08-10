import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { stageCursorPlacement } from '@/utils/stageCursorPlacement';
import type { StageClick } from '@/types/liveClass';

/**
 * O pulso de "olha AQUI" — o clique do professor sobre o palco, que aparece e
 * some (Samuel na call de 06/08: "uma sinalização quando ele clica, que vai
 * sumindo talvez?").
 *
 * ## Por que ele desmonta em vez de só ficar transparente
 *
 * O `t` do clique é a chave de render: dois cliques no mesmo ponto são dois
 * pulsos, e sem desmontar o segundo não reanimaria — a insistência do professor
 * ("aqui! AQUI!") apareceria uma vez só. `RIPPLE_MS` é o próprio ciclo de vida
 * do componente, não uma transição de opacidade.
 */
const RIPPLE_MS = 700;
const SIZE_PX = 34;

export function StageClickRipple({
  click,
  paneW,
  paneH,
}: {
  click: StageClick | null;
  paneW?: number;
  paneH?: number;
}) {
  const [shown, setShown] = useState<StageClick | null>(null);

  useEffect(() => {
    if (!click) {
      setShown(null);
      return;
    }
    setShown(click);
    const id = window.setTimeout(() => setShown(null), RIPPLE_MS);
    return () => window.clearTimeout(id);
  }, [click]);

  if (!shown) return null;

  return (
    <motion.span
      key={shown.t}
      data-testid="stage-click-ripple"
      // Inerte ao mouse pelo mesmo motivo do cursor espelhado: é o desenho do
      // clique de outra pessoa, nunca pode comer um clique de quem está olhando.
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink"
      style={{
        ...stageCursorPlacement(shown.x, shown.y, paneW, paneH),
        width: SIZE_PX,
        height: SIZE_PX,
      }}
      initial={{ scale: 0.3, opacity: 0.9 }}
      animate={{ scale: 1.8, opacity: 0 }}
      transition={{ duration: RIPPLE_MS / 1000, ease: 'easeOut' }}
    />
  );
}
