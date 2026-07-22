import { describe, it, expect } from 'vitest';
import { transpileSnack } from './transpileSnack';

describe('transpileSnack', () => {
  it('transpiles a JSX component with a default export to CommonJS', () => {
    const out = transpileSnack('export default function App(){ return <div>hi</div> }');
    expect(out.error).toBeUndefined();
    expect(out.code).toContain('exports.default');
  });

  it('strips TypeScript annotations', () => {
    const out = transpileSnack('const n: number = 1; export default () => <span>{n}</span>;');
    expect(out.error).toBeUndefined();
    expect(out.code).not.toContain(': number');
  });

  it('returns an error string on a syntax error instead of throwing', () => {
    const out = transpileSnack('export default function( { return <div/> }');
    expect(out.code).toBeUndefined();
    expect(typeof out.error).toBe('string');
  });
});
