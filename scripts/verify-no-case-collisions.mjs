#!/usr/bin/env node
// Dois arquivos que só diferem por caixa são invisíveis na CI (Linux, ext4) e
// fatais no macOS/Windows: `GuidedCodeBank.tsx` + `guidedCodeBank.ts` moravam na
// mesma pasta e o `tsc` emitia os dois para o mesmo `dist/.../GuidedCodeBank.js`,
// um sobrescrevendo o outro. O componente sumia do build e TODAS as stories caíam
// — só na máquina do designer. Nada no repo podia notar, então este guard nota.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const EMITTED = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const problems = [];

// 1. Caminhos idênticos ignorando caixa: o próprio checkout perde um arquivo.
const byLowerPath = new Map();
for (const file of files) {
  const key = file.toLowerCase();
  if (!byLowerPath.has(key)) byLowerPath.set(key, []);
  byLowerPath.get(key).push(file);
}
for (const [, group] of byLowerPath) {
  if (group.length > 1) problems.push(`checkout: ${group.join('  ')}`);
}

// 2. Mesma pasta, mesmo nome sem extensão ignorando caixa, ambos compilados:
//    colidem no `dist/`.
const byLowerStem = new Map();
for (const file of files) {
  const ext = path.extname(file);
  if (!EMITTED.has(ext)) continue;
  const key = path.join(path.dirname(file), path.basename(file, ext)).toLowerCase();
  if (!byLowerStem.has(key)) byLowerStem.set(key, []);
  byLowerStem.get(key).push(file);
}
for (const [, group] of byLowerStem) {
  if (group.length > 1) problems.push(`emit: ${group.join('  ')}`);
}

if (problems.length > 0) {
  console.error('Colisão de caixa em nome de arquivo — quebra macOS/Windows:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nRenomeie um dos lados.');
  process.exit(1);
}

console.log(`OK — ${files.length} arquivos, nenhuma colisão de caixa.`);
