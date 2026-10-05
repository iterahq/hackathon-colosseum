// The Uniwind options of the shell; metro.config.js passes them to `withUniwindConfig`.
// Derived from devfellowship/dfl-lesson-studio `apps/ios/uniwind-options.js`.
//
// rem: the web root font size is 16 px (src/index.css sets none). Set explicitly, so a change of the
// Uniwind default cannot scale every rem-based class (the spacing scale, text-*) on native.

/** The web root font size in px. Native rem must equal it. */
const WEB_REM_PX = 16;

module.exports = {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
  polyfills: { rem: WEB_REM_PX },
};
