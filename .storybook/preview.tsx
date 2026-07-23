import React, { useEffect } from 'react';
import type { Preview, Decorator } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
// Mesma configuração do bootstrap do app (src/main.tsx): o Monaco vem de
// `/vendor/monaco/vs` (self-hosted), nunca da jsDelivr. Ver src/lib/monaco-loader.ts.
import '../src/lib/monaco-loader';
import { I18nProvider } from '../src/i18n';
import { AuthProvider } from '../src/auth/AuthContext';

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
 *  want to showcase. */
const withProviders: Decorator = (Story) => (
  <MemoryRouter>
    <AuthProvider>
      <I18nProvider>
        <Story />
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
       * ⚠️ Sem anotação de tipo nos parâmetros: o Storybook extrai ESTE literal
       * do arquivo e roda `eval` nele durante o build do índice — sintaxe de TS
       * aqui quebra o `build-storybook` com "SyntaxError: Unexpected token ':'".
       */
      storySort: (a, b) =>
        a.title === b.title ? 0 : a.title.localeCompare(b.title, 'pt', { numeric: true }),
    },
  },
  decorators: [withProviders, withTheme],
};

export default preview;
