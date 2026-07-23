import type { StorybookConfig } from '@storybook/react-vite';

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
  // Reuse the app's vite.config (the `@` alias, swapy shim, define vars).
  viteFinal: async (cfg) => cfg,
};

export default config;
