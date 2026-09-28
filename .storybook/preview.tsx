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
       * A página "🆕 Nesta PR #N" (gerada por `scripts/generate-nesta-pr-mdx.ts`,
       * só existe em build de PR) vai SEMPRE primeiro — é o ponto de entrada
       * que substitui vasculhar a árvore Atoms/Molecules/Organisms atrás do
       * que mudou. Ausente num build de `main`, então essa checagem nunca
       * dispara lá.
       *
       * ⚠️ Sem anotação de tipo nos parâmetros: o Storybook extrai ESTE literal
       * do arquivo e roda `eval` nele durante o build do índice — sintaxe de TS
       * aqui quebra o `build-storybook` com "SyntaxError: Unexpected token ':'".
       */
      storySort: (a, b) => {
        const isNestaPr = (entry) =>
          typeof entry.title === 'string' && entry.title.startsWith('🆕 Nesta PR');
        if (isNestaPr(a) && !isNestaPr(b)) return -1;
        if (!isNestaPr(a) && isNestaPr(b)) return 1;
        return a.title === b.title ? 0 : a.title.localeCompare(b.title, 'pt', { numeric: true });
      },
    },
  },
  decorators: [withProviders, withTheme],
};

export default preview;
