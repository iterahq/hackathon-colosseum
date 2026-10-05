/**
 * Where a screen reports a problem. The host decides the sink: the browser console on the web
 * (monitoring reads it), the Metro log in the shell.
 */
export interface LogPort {
  error(message: string, detail: string): void;
}
