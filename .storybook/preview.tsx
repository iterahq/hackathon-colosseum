import React, { useEffect } from 'react';
import type { Preview, Decorator } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
// Mesma configuração do bootstrap do app (src/main.tsx): o Monaco vem de
// `/vendor/monaco/vs` (self-hosted), nunca da jsDelivr. Ver src/lib/monaco-loader.ts.
import '../src/lib/monaco-loader';
// As fontes da marca também são self-hosted (`/vendor/fonts/fonts.css`); como o
// preview do Storybook tem `iframe.html` próprio, o <link> mora em
// `.storybook/preview-head.html` — não há import de CSS pra elas aqui.
import { I18nProvider } from '../src/i18n';
import { AuthProvider } from '../src/auth/AuthContext';
import { IteraActivityHost } from '../src/components/branded/activity/IteraActivityHost';

/** The app forces a dark theme via `class="dark"` on the document — mirror it
 *  in Storybook so the evergreen-on-obsidiana tokens resolve. */
function ThemeShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
  }, []);
  return (
    <div className="dark bg-background text-foreground" style={{ minHeight: '100%', padding: 24 }}>
      {children}
    </div>
  );
}

const withTheme: Decorator = (Story) => (
  <ThemeShell>
    <Story />
  </ThemeShell>
);

/** Most branded components consume the i18n context, react-router, and (a few)
 *  the auth context. AuthProvider yields an anonymous session in Storybook —
 *  components fall back to their empty/Learner states, which is exactly what we
 *  want to showcase.
 *
 *  `IteraActivityHost` is the SAME adapter `src/App.tsx` mounts at its root, and
 *  it is here for the same reason it is there: since Fase C the activity
 *  renderers live in `@iterahq/activities` and read i18n / learner scope from the
 *  ACTIVITY host context, not from `@/i18n`. Without it every activity story
 *  renders against the package's fallback context — the strings are identical
 *  (asserted by `activityDefaultI18n.test.tsx`) but the locale is pinned to `pt`
 *  and the learner scope is absent, so a story would quietly stop being a
 *  picture of the app. It wraps everything rather than only the activity stories
 *  because a decorator that has to be remembered per story is a decorator that
 *  will be forgotten. */
const withProviders: Decorator = (Story) => (
  <MemoryRouter>
    <AuthProvider>
      <I18nProvider>
        <IteraActivityHost>
          <Story />
        </IteraActivityHost>
      </I18nProvider>
    </AuthProvider>
  </MemoryRouter>
);

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: 'fullscreen',
    options: {
      /**
       * Ordena a sidebar pelo CAMINHO do título (alfanumérico, com `numeric`
       * para os prefixos "1 ·", "2 ·" … dos grupos de função pedagógica das
       * activities), mas PRESERVA a ordem em que as stories foram escritas
       * dentro de cada arquivo — sem isso o Storybook usaria a ordem do glob e
       * os grupos numerados apareceriam fora de sequência.
       *
       * "Design Playground" vai SEMPRE primeiro — em build de `main` e de PR
       * — é o ponto de entrada da vitrine. DENTRO do grupo, a ordem é "ordem
       * de envio": arquivo mais recente primeiro, por `playground-order:<score>`
       * — uma tag que `scripts/storybook-playground-indexer.ts` grava em
       * tempo de indexação (Node, com `git log`) em cada entrada de story sob
       * `design-playground/` e (só em build de PR) `.storybook/generated/`
       * (ver `scripts/generate-nesta-pr-stories.ts`). Fora do grupo, a ordem
       * de hoje não muda.
       *
       * ⚠️ Sem anotação de tipo nos parâmetros, e SEM QUALQUER referência a
       * import/closure deste arquivo dentro da função: o Storybook extrai o
       * SOURCE TEXT literal desta função e roda `eval` nele isolado, durante
       * o build do índice (`getStorySortParameter`,
       * `storybook/internal/csf-tools`) — sintaxe de TS aqui quebra o
       * `build-storybook` com "SyntaxError: Unexpected token ':'", e uma
       * variável importada quebra em runtime com "ReferenceError" (o eval não
       * tem o escopo do módulo). Por isso a leitura da tag
       * `playground-order:` abaixo é reimplementada inline em vez de
       * importada de `scripts/storybook-playground-order.ts` — esse módulo é
       * a fonte da verdade do FORMATO da tag, mas não pode ser importado
       * aqui.
       */
      storySort: (a, b) => {
        const isDesignPlayground = (entry) =>
          typeof entry.title === 'string' &&
          (entry.title === 'Design Playground' || entry.title.indexOf('Design Playground/') === 0);
        const aIsPlayground = isDesignPlayground(a);
        const bIsPlayground = isDesignPlayground(b);
        if (aIsPlayground && !bIsPlayground) return -1;
        if (!aIsPlayground && bIsPlayground) return 1;

        if (aIsPlayground && bIsPlayground) {
          const orderOf = (entry) => {
            const tags = entry.tags || [];
            for (let i = 0; i < tags.length; i++) {
              if (typeof tags[i] === 'string' && tags[i].indexOf('playground-order:') === 0) {
                const value = Number(tags[i].slice('playground-order:'.length));
                return isNaN(value) ? 0 : value;
              }
            }
            return 0;
          };
          const scoreDiff = orderOf(b) - orderOf(a); // higher score (more recent) first
          if (scoreDiff !== 0) return scoreDiff;
        }

        return a.title === b.title ? 0 : a.title.localeCompare(b.title, 'pt', { numeric: true });
      },
    },
  },
  decorators: [withProviders, withTheme],
};

export default preview;
