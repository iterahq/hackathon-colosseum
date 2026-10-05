import { describe, expect, it } from 'vitest';
import { mentionsTera, textMentionsTera } from './teraMention.js';

describe('textMentionsTera', () => {
  it('matches the whole word with a capital T', () => {
    for (const text of ['Oi, eu sou o Tera', 'Tera, bem-vindo', 'Tera Bolos de Pote abre hoje', 'o Tera.'])
      expect(textMentionsTera(text), text).toBe(true);
  });

  it('ignores Itera, lowercase, compounds and underscores', () => {
    for (const text of ['Bem-vindo à Itera', 'tera bolos', 'um Terabyte', 'Tera_x', 'ITERA', 'Teras'])
      expect(textMentionsTera(text), text).toBe(false);
  });

  it('ignores Tera inside inline code, fenced code, links and media', () => {
    expect(textMentionsTera('Abra `Tera` no editor')).toBe(false);
    expect(textMentionsTera('```html\n<h1>Tera</h1>\n```')).toBe(false);
    expect(textMentionsTera('Visite tera.site hoje')).toBe(false);
    expect(textMentionsTera('https://tera.site/Tera')).toBe(false);
    expect(textMentionsTera('![Tera](/lesson-media/Tera.png)')).toBe(false);
    expect(textMentionsTera('O `h1` do Tera fica em tera.site')).toBe(true);
  });
});

describe('mentionsTera — which fields count', () => {
  it('reads the prose fields wherever they sit', () => {
    expect(mentionsTera({ instruction: { text: 'Oi, eu sou o Tera' } })).toBe(true);
    expect(mentionsTera({ instruction: { description: 'A loja do Tera' } })).toBe(true);
    expect(mentionsTera({ prompt: 'Qual página é do Tera?' })).toBe(true);
    expect(mentionsTera({ options: [{ id: 'a', label: 'a do Tera' }] })).toBe(true);
    expect(mentionsTera({ reveal: { prompt: 'x', answer: 'o Tera faz bolo' } })).toBe(true);
    expect(mentionsTera({ explanation: 'Porque o Tera disse' })).toBe(true);
    expect(mentionsTera({ wire: { wrong_hint: 'Olha o Tera de novo' } })).toBe(true);
    expect(mentionsTera({ prompt: { pt: 'o Tera', en: 'Tera' } })).toBe(true);
    expect(mentionsTera({ stamp: 'Tera aprovou' })).toBe(true);
    expect(mentionsTera({ page: { elements: [{ id: 'h', text: 'x', name: 'título', job: 'o nome do Tera' }] } })).toBe(true);
  });

  it('never reads a guide or element name, a placeholder or a url label', () => {
    expect(mentionsTera({ guide: { name: 'Tera' }, page: { url_label: 'Tera', elements: [{ id: 'h', text: 'x', name: 'Tera' }] } })).toBe(false);
    expect(mentionsTera({ free_text: { placeholder: 'Fale com o Tera' } })).toBe(false);
  });

  it('never reads code, urls, ids or media', () => {
    expect(mentionsTera({ starter: 'const Tera = 1', solution: 'Tera', id: 'Tera', image_url: 'https://x/Tera.png' })).toBe(false);
    expect(mentionsTera({ instruction: { text: 'Abra `Tera`' } })).toBe(false);
    expect(mentionsTera({ instruction: { text: 'Bem-vindo à Itera' } })).toBe(false);
    expect(mentionsTera(null)).toBe(false);
  });
});
