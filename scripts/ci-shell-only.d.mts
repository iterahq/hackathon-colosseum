export const SHELL_PREFIX: string;
export function isShellOnly(paths: string[]): boolean;
export function diffArgs(env: {
  eventName?: string;
  baseSha?: string;
  before?: string;
  headSha?: string;
}): string[] | null;
