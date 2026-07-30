import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guard de fonte: a mão já foi entregue no chrome e removida sem querer num
// refactor de layout. Abaixo de `lg` a sidebar cai atrás do rodapé fixo, então
// perder esse slot deixa o aluno sem como pedir a palavra no celular.
const page = readFileSync(resolve(__dirname, '../pages/LiveSessionPage.tsx'), 'utf8');
const sidebar = readFileSync(resolve(__dirname, '../components/live/LiveSidebar.tsx'), 'utf8');

describe('levantar a mão no celular', () => {
  it('a página entrega a mão ao chrome do topo', () => {
    expect(page).toMatch(/handSlot=\{[\s\S]{0,200}LiveHandButton/);
  });

  it('o slot do chrome só vale abaixo de lg — no desktop ela mora na sidebar', () => {
    expect(page).toMatch(/lg:hidden[\s\S]{0,120}LiveHandButton/);
    expect(sidebar).toMatch(/hidden lg:block[^"]*"\s*>\{handSlot\}/);
  });
});
