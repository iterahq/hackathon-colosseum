const path = require('path');
const config = require('expo/metro-config').getDefaultConfig(__dirname);

// R-6: the shell reads the pure, source-only bridge package by name. No dependency entry (the shell
// keeps its own lockfile): Metro maps the name to the folder and watches it. expo-doctor rejects
// `disableHierarchicalLookup` and `nodeModulesPaths`, so lookup stays hierarchical. That is safe today
// because no file of packages/bridge imports a bare module (react included): the repo root's React 18
// is unreachable from it (packages/bridge/src/imports.test.ts). `check:one-react` after the export fails
// the job on two Reacts (ADR-2). R-11 replaces this with the `file:` link of PLAN 2.3.
const bridge = path.resolve(__dirname, '../../packages/bridge');
config.watchFolders = [...(config.watchFolders ?? []), bridge];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, '@iterahq/shell-bridge': bridge };

module.exports = config;
