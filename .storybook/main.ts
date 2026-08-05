import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import type { Alias, AliasOptions } from 'vite';

const asArray = (alias: AliasOptions | undefined): Alias[] =>
  Array.isArray(alias)
    ? alias
    : Object.entries(alias ?? {}).map(([find, replacement]) => ({ find, replacement }));

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    // Designer brainstorm space — see "Story/Component ownership" in CLAUDE.md/AGENTS.md.
    '../design-playground/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-docs'],
  /**
   * Serve `public/` (React UMD + Tailwind Play do preview do snack, e o Monaco
   * vendorizado em `public/vendor/monaco/vs`). O builder Vite do Storybook não
   * herda o `publicDir` da config do app, então precisa ser explícito — sem
   * isso o editor de código das stories cairia em 404 ao buscar o loader.
   */
  staticDirs: ['../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  /**
   * Reuse the app's vite.config (the `@` alias, swapy shim, define vars), mais o
   * ÚNICO desvio da vitrine: a itera-api falsa (`.storybook/mocks/iteraApi.ts`).
   * O `find` é ancorado de propósito — `@/api/iteraApiError` é outro módulo, e
   * casamento por prefixo o arrastaria junto.
   */
  viteFinal: async (cfg) => ({
    ...cfg,
    resolve: {
      ...cfg.resolve,
      alias: [
        {
          find: /^@\/api\/iteraApi$/,
          replacement: fileURLToPath(new URL('./mocks/iteraApi.ts', import.meta.url)),
        },
        ...asArray(cfg.resolve?.alias),
      ],
    },
  }),
};

export default config;
