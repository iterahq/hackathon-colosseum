import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
    // Designer brainstorm space — see "Story/Component ownership" in CLAUDE.md/AGENTS.md.
    '../design-playground/**/*.stories.@(ts|tsx)',
  ],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // Reuse the app's vite.config (the `@` alias, swapy shim, define vars).
  viteFinal: async (cfg) => cfg,
};

export default config;
