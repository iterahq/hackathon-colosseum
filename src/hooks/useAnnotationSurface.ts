import { useEffect, useState } from 'react';

/**
 * As duas medições que a camada de anotação precisa e o React não dá de graça:
 * o TAMANHO da superfície de quem vê, e o RELÓGIO do esmaecimento.
 *
 * Separadas do componente porque as duas são a mesma decisão de custo: nenhuma
 * das duas pode rodar quando não há nada para medir. Um `ResizeObserver` vivo
 * numa aula sem palco e um `setInterval` de 60ms numa aula sem traço são o tipo
 * de custo que ninguém percebe até a aba do aluno esquentar.
 */

/** Tamanho atual do painel de destino. `{0,0}` enquanto ele não existe. */
export function useSurfaceSize(el: HTMLElement | null): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
}

/**
 * `Date.now()` que anda enquanto `running`. Parado, devolve um instante
 * congelado — que é o certo: sem traço esmaecendo, nada depende do relógio.
 */
export function useFadeClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 60);
    return () => window.clearInterval(id);
  }, [running]);
  return now;
}

/**
 * O painel em que a camada é portada. Procura repetidamente porque o painel pode
 * montar DEPOIS dela (Monaco, troca de atividade) — buscar uma vez só perderia o
 * primeiro traço, ou todos.
 */
export function usePaneBySelector(selector: string): HTMLElement | null {
  const [pane, setPane] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const now = document.querySelector<HTMLElement>(selector);
    if (now) {
      setPane(now);
      return;
    }
    const id = window.setInterval(() => {
      const late = document.querySelector<HTMLElement>(selector);
      if (!late) return;
      setPane(late);
      window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [selector]);
  return pane;
}
