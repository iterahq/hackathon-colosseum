/**
 * T1 — AS STORIES INTERAGEM DE VERDADE, NO CI (plano `20260728-itera-activity-testing`, Fase 3).
 *
 * O irmão `storyRenderSmoke.test.tsx` prova MONTAGEM. Este prova INTERAÇÃO:
 * para cada story que define um `play`, ele monta a story e roda **o mesmo
 * `play`** que o Storybook roda quando o Tainan abre o canvas.
 *
 * É literalmente o ADR-2 executando: *"as stories continuam sendo a definição
 * canônica de cada estado, mas quem executa os testes é o Vitest, rodando sobre
 * as mesmas stories. Uma definição de estado, dois consumidores (UI + CI)."*
 * Se a UI quebrar, a story fica vermelha aqui — e o estado que ela documenta
 * some do Storybook no mesmo commit. Não dá para as duas superfícies
 * divergirem, porque só existe uma.
 *
 * ⚠️ O QUE ESTE TESTE PROVA — E O QUE NÃO PROVA.
 *   Prova: que o estado nomeado pela story é ALCANÇÁVEL POR UM USUÁRIO REAL,
 *   clicando/digitando, e que as asserções escritas dentro do `play` valem.
 *   Isto é o que substitui as props `initial*` removidas nesta fase (ADR-4).
 *   NÃO prova: layout, CSS, geometria, foco — jsdom não tem layout. ADR-8
 *   manda `code` (iframe + Monaco) para o browser mode por esse motivo.
 *
 * Nota de custo: as stories do sandbox esperam a animação de digitação real
 * (~2 s cada). É deliberado — dirigir a animação é dirigir o produto.
 */
import './storybookTestBridge';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { clearAllMocks } from 'storybook/test';
import { indexStories } from './storyIndex';

const ALL_WITH_PLAY = indexStories().filter((s) => typeof s.play === 'function');

/**
 * ADR-8: `match` e `code` têm um projeto Vitest próprio, com navegador de
 * verdade (`vitest.browser.config.ts`). Os `play` marcados `browser-mode`
 * dependem de layout/iframe/Monaco e NÃO rodam aqui — rodariam mentindo.
 * A separação é pela tag, não por uma lista de caminhos.
 */
const BROWSER_ONLY = ALL_WITH_PLAY.filter((s) => s.tags.includes('browser-mode'));
const WITH_PLAY = ALL_WITH_PLAY.filter((s) => !s.tags.includes('browser-mode'));

/**
 * Piso: se um refactor apagar os `play` sem ninguém perceber, o teste não pode
 * ficar verde por vacuidade ("0 stories interagiram, tudo passou").
 */
const MIN_INTERACTIVE_STORIES = 20;

describe('interação real — todo `play` de story roda no CI (T1)', () => {
  const captured: string[] = [];

  beforeAll(() => {
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      captured.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    });
    return () => spy.mockRestore();
  });

  /**
   * O Storybook zera os `fn()` de `args` entre renders de story; o caminho de
   * portable stories não faz isso sozinho, e um `fn()` declarado no `meta` é
   * COMPARTILHADO por todas as stories do arquivo. Sem este reset, um `play`
   * que assere "não completou" herdaria a chamada do `play` anterior — e
   * falharia por contaminação, não por regressão. `clearAllMocks` é o do
   * `storybook/test` de propósito: os spies dele vivem no registro dele.
   */
  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    captured.length = 0;
  });

  it('existe um conjunto de stories interativas — o teste não passa por vacuidade', () => {
    expect(WITH_PLAY.length).toBeGreaterThanOrEqual(MIN_INTERACTIVE_STORIES);
  });

  it('as stories `browser-mode` existem e ficam de fora daqui, não silenciosamente perdidas', () => {
    expect(BROWSER_ONLY.length).toBeGreaterThan(0);
    // A tag é CARA: cada arquivo aqui sobe um Chromium no `browser-mode`, que é
    // o job cujo orçamento o ADR-9 mede. Por isso a lista é fechada e explícita.
    //
    // Os dois primeiros são os kinds que o ADR-8 nomeia. O terceiro,
    // `ActivityStyleFreeze`, entrou em 2026-08-27 e NÃO é um kind — é o
    // congelamento de estilo da Fase 0 do plano
    // `20260827-itera-activities-theming`. Ele carrega a tag pelo mesmo motivo
    // que o ADR-8 dá, e não por um novo: jsdom não tem cascata nem layout, então
    // `getComputedStyle(el).borderRadius` lá responde string vazia para uma
    // classe do Tailwind. Rodá-lo aqui não seria uma cobertura mais fraca — seria
    // um teste verde que não mede nada, que é pior do que não tê-lo.
    //
    // `XrayActivity` e `LiveTypeActivity` (2026-09-24, as cenas) entram pelo
    // mesmo motivo de layout: o gate do raio-X é ÁREA varrida medida com
    // `getBoundingClientRect` (0×0 no jsdom), e o `live_type` só abre depois de
    // ~3 s de digitação do fantasma com timers reais seguidos de 700 ms de texto
    // parado — um `play` que no jsdom ou estoura o timeout ou mede nada.
    const files = new Set(BROWSER_ONLY.map((s) => s.file));
    expect(
      [...files].filter(
        (f) => !/MatchActivity|CodeSnackActivity|ActivityStyleFreeze|XrayActivity|LiveTypeActivity/.test(f),
      ),
    ).toEqual([]);
  });

  it.each(WITH_PLAY.map((s) => [s.id, s] as const))(
    '%s: o `play` percorre o estado que a story nomeia',
    async (_id, story) => {
      const { container } = render(<story.Component />);
      await story.play!({ canvasElement: container });
      expect(captured, `${story.file} → ${story.exportName} escreveu em console.error`).toEqual([]);
    },
    20000,
  );
});
