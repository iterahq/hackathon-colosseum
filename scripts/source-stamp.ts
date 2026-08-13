/**
 * The `data-source` build stamp moved OUT of this repository.
 *
 * `@devfellowship/ux-paths-capture` is published to the PUBLIC npm registry so
 * that a second application — in another GitHub organization, where no token of
 * ours reaches — runs the same stamp instead of writing its own. Two producers
 * of one contract drift the way the two READERS already did, and the drift is
 * invisible: both stay green while a designer clicks one element and is handed
 * another element's file.
 *
 * This file is what stops that happening here. It does not own a copy; it
 * re-exports the package and pins the one thing that is local — the name of the
 * switch. `ITERA_SOURCE_STAMP` is kept rather than renamed to the package
 * default, because several CI steps and a Playwright config already set it, and
 * a renamed switch does not fail loudly — it silently produces a capture build
 * with no stamps and an empty region map.
 *
 * 🚨 Everything about WHY the gate is an environment variable and not the build
 * mode, and why the default must be asserted over the built artifact, lives in
 * the package. `npm run assert:no-source-stamp` is the artifact check, and CI
 * runs it in both directions.
 */
import { sourceStamp as sourceStampPlugin } from "@devfellowship/ux-paths-capture/vite";
import type { Plugin } from "vite";

export { SOURCE_STAMP_ATTR, isSourceStampEnabled, stampSource } from "@devfellowship/ux-paths-capture";

/** This repository's switch. Absent = off, which is the default. */
export const SOURCE_STAMP_ENV = "ITERA_SOURCE_STAMP";

export interface SourceStampOptions {
  /** Repository root. Attribute paths are relative to it. */
  root: string;
  /** Injected for testing. Defaults to the real process environment. */
  env?: NodeJS.ProcessEnv;
}

/** The plugin, or `undefined` when the switch is off — which is the default. */
export function sourceStamp(options: SourceStampOptions): Plugin | undefined {
  return sourceStampPlugin({
    root: options.root,
    env: options.env,
    envVar: SOURCE_STAMP_ENV,
  });
}
