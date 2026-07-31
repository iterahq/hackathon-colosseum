import { describe, expect, it } from 'vitest';
import { parseRichText, splitSteps } from '@/utils/richText';

/**
 * Varredura em produção (2026-07-31) nas 86 activities com texto de instrução:
 * ZERO linhas `---`, `?>` ou `?=`. Nenhuma tela existente muda de comportamento
 * ao ganhar esses delimitadores — é o que estes testes trancam.
 */
describe('passos e revelação', () => {
  it('sem --- existe um passo só', () => {
    expect(splitSteps(parseRichText('um\n\ndois'))).toHaveLength(1);
  });

  it('--- corta o texto em passos', () => {
    const steps = splitSteps(parseRichText('## a\n\n---\n\nb\n\n---\n\nc'));
    expect(steps).toHaveLength(3);
    expect(steps[0][0].type).toBe('heading');
  });

  it('--- solto no começo, no fim ou dobrado não cria passo vazio', () => {
    expect(splitSteps(parseRichText('---\n\na\n\n---\n---\n\nb\n\n---'))).toHaveLength(2);
  });

  it('hífen de lista continua lista', () => {
    const blocks = parseRichText('- um\n- dois');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
  });

  it('?> e ?= viram um bloco de revelação', () => {
    const [block] = parseRichText('?> Por que não atualizou?\n?= Porque `title` é prop.');
    expect(block.type).toBe('reveal');
    if (block.type !== 'reveal') return;
    expect(block.prompt.map((s) => ('value' in s ? s.value : '')).join('')).toContain('Por que');
    expect(block.answer.some((s) => s.type === 'code' && s.value === 'title')).toBe(true);
  });

  it('?= órfão não sobra como texto cru na tela', () => {
    const [block] = parseRichText('?= resposta sem pergunta');
    expect(block.type).toBe('reveal');
    if (block.type !== 'reveal') return;
    expect(block.prompt).toHaveLength(0);
  });

  it('pergunta sem resposta não vira revelação quebrada', () => {
    const [block] = parseRichText('?> só a pergunta');
    expect(block.type).toBe('reveal');
    if (block.type !== 'reveal') return;
    expect(block.answer).toHaveLength(0);
  });

  it('dentro de bloco cercado nada disso é interpretado', () => {
    const blocks = parseRichText('```\n---\n?> não\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
  });
});
