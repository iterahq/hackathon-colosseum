// Metro config of the shell (PLAN 2.3, R-11; R-18 shell half).
//
// Shape derived from devfellowship/dfl-lesson-studio `apps/ios/metro.config.js` (Uniwind as the
// outermost wrapper, its options in a file of their own). What differs: Lesson Studio's shell is a
// root npm workspace, so Expo finds `packages/*` and one hoisted React by itself. This shell is not
// (ADR-1: own install, own lockfile), so the two things below are written out.
//
// 1. WHERE THE SHARED PACKAGES ARE. `package.json` links them (`file:../../packages/<name>`), so
//    `@iterahq/screens/not-found` resolves through `node_modules` and the package's `exports`. The link
//    points outside this folder, and Metro only reads folders it watches: `watchFolders`.
//
// 2. WHOSE REACT THEY GET. A file of `packages/screens` imports `react`, `react-native` and `uniwind`.
//    Metro looks for those upwards from the file: `packages/screens/node_modules`, `packages/node_modules`,
//    the repo root — never `apps/mobile/node_modules`, which is not an ancestor. On a developer machine the
//    root holds the WEB's React (19.3, and no react-native); on the shell's CI job the root is not
//    installed at all. So a bare import that comes from a shared package is resolved as if this folder
//    had made it. PLAN 2.3 names `nodeModulesPaths` + `disableHierarchicalLookup` for this; expo-doctor
//    rejects both, and they would change the lookup for every module, not only for these packages.
//    `npm run check:one-react` fails the job on two Reacts in the bundle.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const uniwindOptions = require('./uniwind-options');

const SHARED_PACKAGES = path.resolve(__dirname, '../../packages') + path.sep;
const FROM_THE_SHELL = path.join(__dirname, 'package.json');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), SHARED_PACKAGES];

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (bare && context.originModulePath.startsWith(SHARED_PACKAGES)) {
    return resolve({ ...context, originModulePath: FROM_THE_SHELL }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, uniwindOptions);
