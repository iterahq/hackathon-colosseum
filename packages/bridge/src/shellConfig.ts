/**
 * The minimum-shell-version rule (plan section 7, rule 7; ledger row 50).
 *
 * The web origin serves `/shell-config.json`. A web deploy can raise
 * `minShellVersion`; a shell below it shows the "update now" screen and does
 * not load the web UI. The file lives on the web origin, so the same deploy
 * that needs a newer shell also raises the minimum.
 *
 * Fail open: when the file is absent, unreadable or invalid (offline, a server
 * error), the shell loads the web UI. The offline page and the version skew
 * contract tests cover that path; a network error must not lock users out.
 *
 * Remote capability flags (plan 20261003-lesson-studio-native-later-phases, R6):
 * `capabilities` is a list of names that a web deploy turns on, for example
 * `route.exports.native`. The default is OFF: a name that is absent, a file with
 * no list, an invalid name and a file that does not load all give "off". The
 * rollback of a flag is a web deploy that removes the name (the Hotwire pattern
 * of the parent plan, section 1.2): no App Store review.
 */
import { compareVersions } from './protocol';

export const SHELL_CONFIG_PATH = '/shell-config.json';

/** The hosts that the "update now" button may open. */
export const UPDATE_URL_HOSTS = ['apps.apple.com', 'testflight.apple.com'] as const;

/** The syntax of a capability flag name: lower-case dot-separated words, for example `route.exports.native`. */
const CAPABILITY_NAME = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;
/** More names than this is not a config that a person wrote. The parser keeps the first ones only. */
export const MAX_SHELL_CAPABILITIES = 32;

export interface ShellConfig {
  minShellVersion: string;
  updateUrl: string | null;
  /** The remote capability flags that are ON. Empty when the file names none (the default). */
  capabilities: readonly string[];
}

/** Read the `capabilities` list. Anything that is not a valid name is dropped, so it stays off. */
export function parseShellCapabilities(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const names = value.filter((v): v is string => typeof v === 'string' && v.length <= 64 && CAPABILITY_NAME.test(v));
  return [...new Set(names)].slice(0, MAX_SHELL_CAPABILITIES);
}

/** True only when the config loaded and names the flag. No config means off. */
export function hasShellCapability(config: ShellConfig | null, name: string): boolean {
  return config !== null && config.capabilities.includes(name);
}

/** Parse the remote config. Returns null for anything that is not a valid config. */
export function parseShellConfig(value: unknown): ShellConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.minShellVersion !== 'string' || compareVersions(v.minShellVersion, '0.0.0') === null) return null;
  let updateUrl: string | null = null;
  if (typeof v.updateUrl === 'string') {
    const m = /^https:\/\/([^/?#:@]+)(\/|$)/i.exec(v.updateUrl);
    if (m && (UPDATE_URL_HOSTS as readonly string[]).includes(m[1].toLowerCase())) updateUrl = v.updateUrl;
  }
  return { minShellVersion: v.minShellVersion, updateUrl, capabilities: parseShellCapabilities(v.capabilities) };
}

export type ShellGate =
  | { kind: 'run' }
  | { kind: 'update'; shellVersion: string; minShellVersion: string; updateUrl: string | null };

/** The decision of the shell at start: run the web UI, or show "update now". */
export function shellGate(shellVersion: string, config: ShellConfig | null): ShellGate {
  if (!config) return { kind: 'run' };
  const cmp = compareVersions(shellVersion, config.minShellVersion);
  // A shell with no valid version of its own cannot prove it is new enough.
  if (cmp === null || cmp < 0) {
    return { kind: 'update', shellVersion, minShellVersion: config.minShellVersion, updateUrl: config.updateUrl };
  }
  return { kind: 'run' };
}
