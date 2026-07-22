import { transform } from 'sucrase';
import type { TranspileResult } from '@/types/codeSnack';

/**
 * Transpile the learner's single-file JSX/TSX component to plain JS using
 * react-live's runtime transpiler (sucrase). `imports` transform rewrites
 * `export default` to CommonJS so the preview iframe can pick up `module.exports`.
 * Returns an error string instead of throwing so the preview degrades to a
 * friendly message.
 */
export function transpileSnack(source: string): TranspileResult {
  try {
    const code = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      production: true,
    }).code;
    return { code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
