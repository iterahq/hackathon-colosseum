/**
 * BROWSER MODE — o tier caro, escopado ao mínimo (ADR-8 / ADR-9).
 *
 * Plano `20260728-itera-activity-testing`, Fase 3, PR B.
 *
 * ── POR QUE UM ARQUIVO SEPARADO, E NÃO UM `projects` no `vitest.config.ts` ──
 * O ADR-9 exige que este tier entre **não-bloqueante por uma semana**. Se ele
 * morasse dentro da config padrão, um `npm test` — que é o gate de todo PR —
 * passaria a subir um navegador, e o "não-bloqueante" viraria letra morta no
 * primeiro dia. Config separada + script separado + job de CI separado é o que
 * torna a promessa do ADR-9 verificável em vez de declarada.
 *
 * ── O QUE RODA AQUI, E SÓ ISSO ──────────────────────────────────────────────
 * As stories marcadas com a tag `browser-mode`. Hoje: `match` e `code`, os dois
 * kinds que o ADR-8 nomeia. Os outros 9 seguem em jsdom, no `npm test` que já
 * existe — é a decisão híbrida da Q1, e a tag é como ela fica declarada NO
 * CÓDIGO em vez de numa lista de caminhos que apodrece.
 *
 * ⚠️ ACHADO SOBRE `match` (ver o PR): o ADR-8 o manda para cá "por causa da
 * geometria de drag do `@dnd-kit/react`". O `MatchActivity` não usa drag
 * nenhum — `@dnd-kit/react` está no `package.json` e não é importado em `src/`.
 * O match é tap-esquerda + tap-direita, e o PR A já o dirige inteiro em jsdom.
 * Ele continua aqui para não contrariar um ADR travado sem decisão; a
 * recomendação de estreitar o escopo para `code` está no relatório da fase.
 */
import path from 'path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

export default defineConfig({
  plugins: [react(), storybookTest({ configDir: '.storybook', tags: { include: ['browser-mode'] } })],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    name: 'storybook-browser',
    setupFiles: ['./.storybook/vitest.setup.ts'],
    /**
     * O `code` carrega o Monaco por AMD a partir de `/vendor/monaco/vs` e
     * compila o preview dentro de um iframe. Isso é lento na primeira vez, e é
     * o preço de testar a coisa real em vez do mock — o padrão de 15 s do
     * Vitest estoura antes de o editor existir.
     */
    testTimeout: 45000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
