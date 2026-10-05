import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests of the shell. Pure TypeScript only: the files under test import no
// React Native module, so they run in plain Node. The root vitest config does
// not include apps/** and the web suite installs no Expo package; without this
// file Vitest would walk up to the root config.
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@iterahq/shell-bridge': path.resolve(__dirname, '../../packages/bridge/src/index.ts'),
      '@iterahq/shell-core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
