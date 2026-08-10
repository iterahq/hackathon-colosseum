import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guard de fonte: a 360px o grupo central do chrome já cresceu por cima do X
// (que é pintado antes) e trancou o aluno na aula. jsdom não tem layout, então
// o contrato aqui é a classe.
const chrome = readFileSync(resolve(__dirname, '../components/live/LiveSessionChrome.tsx'), 'utf8');
const hand = readFileSync(resolve(__dirname, '../components/live/LiveHandButton.tsx'), 'utf8');

describe('chrome da aula no celular', () => {
  it('o grupo central tem teto e nunca alcança o X', () => {
    expect(chrome).toMatch(/data-testid="live-indicator"/);
    expect(chrome).toMatch(/max-w-\[calc\(100%_-_6rem\)\]/);
  });

  it('o X fica acima do grupo central', () => {
    expect(chrome).toMatch(/data-testid="live-close"[\s\S]{0,120}z-10/);
  });

  it('a mão tem alvo de toque de 40px no celular', () => {
    expect(hand).toMatch(/'h-10 px-3 sm:h-8/);
  });
});
