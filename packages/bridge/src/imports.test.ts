import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SPEC = /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

describe('packages/bridge/src imports', () => {
  it('only relative modules, plus node:* in tests: Metro lookup from the repo root never reaches react (ADR-2)', () => {
    const bad: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.ts'))) {
      const text = readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of text.matchAll(SPEC)) {
        const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
        const test = /\.(test|testkit)\.ts$/.test(f);
        if (!spec.startsWith('.') && !(test && (spec.startsWith('node:') || spec === 'vitest' || spec === 'eslint'))) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
