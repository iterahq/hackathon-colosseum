import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText } from '@/utils/richText';

const plain = (spans: ReturnType<typeof parseInline>): string =>
  spans.map((s) => (s.type === 'strong' || s.type === 'em' ? plain(s.spans) : s.value)).join('');

describe('parseInline', () => {
  it('sem delimitador, devolve o texto intacto', () => {
    expect(parseInline('Quem passa escreve <BookCard title="Clean Code" />.')).toEqual([
      { type: 'text', value: 'Quem passa escreve <BookCard title="Clean Code" />.' },
    ]);
  });

  it('não trata sublinhado como ênfase', () => {
    expect(parseInline('App_FINAL_agora_vai_2.jsx')).toEqual([
      { type: 'text', value: 'App_FINAL_agora_vai_2.jsx' },
    ]);
  });

  it('não trata multiplicação como ênfase', () => {
    expect(parseInline('5 * 3 * 2')).toEqual([{ type: 'text', value: '5 * 3 * 2' }]);
  });

  it('não trata glob de shell como negrito', () => {
    // Saída e comando de terminal chegam crus na bolha do sandbox: dois `**`
    // soltos na mesma linha não podem virar marcação.
    const line = 'find . -name "**/*.ts" -o -name "**/*.js"';
    expect(parseInline(line)).toEqual([{ type: 'text', value: line }]);
    expect(parseInline('a ** b ** c')).toEqual([{ type: 'text', value: 'a ** b ** c' }]);
  });

  it('aninha código dentro de negrito', () => {
    const spans = parseInline('**1. Sentou? `git pull`.**');
    expect(spans).toEqual([
      {
        type: 'strong',
        spans: [
          { type: 'text', value: '1. Sentou? ' },
          { type: 'code', value: 'git pull' },
          { type: 'text', value: '.' },
        ],
      },
    ]);
  });

  it('aninha ênfase dentro de negrito', () => {
    expect(plain(parseInline('**O código curto (o *hash*).**'))).toBe('O código curto (o hash).');
  });

  it('separa negritos vizinhos em vez de engolir o meio', () => {
    expect(parseInline('**a** e **b**').filter((s) => s.type === 'strong')).toHaveLength(2);
  });

  it('três asteriscos são negrito com ênfase, sem sobrar asterisco', () => {
    const spans = parseInline('***muito***');
    expect(spans).toEqual([
      { type: 'strong', spans: [{ type: 'em', spans: [{ type: 'text', value: 'muito' }] }] },
    ]);
    expect(plain(spans)).toBe('muito');
  });
});

describe('parseRichText', () => {
  it('linha em branco separa parágrafo e a quebra simples é preservada', () => {
    const blocks = parseRichText('uma\nlinha\n\noutra');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'paragraph', spans: [{ type: 'text', value: 'uma\nlinha' }] });
  });

  it('marcação aberta não atravessa a quebra de linha', () => {
    const [block] = parseRichText('**item um\nitem dois**');
    expect(block).toEqual({ type: 'paragraph', spans: [{ type: 'text', value: '**item um\nitem dois**' }] });
  });

  it('reconhece título, citação e lista', () => {
    const blocks = parseRichText('## Título\n\n> citação\n\n- um\n- dois');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'quote', 'list']);
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false });
  });

  it('não junta lista numerada com lista de marcador', () => {
    const blocks = parseRichText('1. um\n- dois');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'list']);
  });

  it('a numeração é do autor: a lista começa onde ele começou', () => {
    expect(parseRichText('7. Salve o arquivo\n8. Recarregue')).toMatchObject([
      { type: 'list', ordered: true, start: 7 },
    ]);
    expect(parseRichText('2026. foi o ano')).toMatchObject([{ type: 'list', start: 2026 }]);
  });

  it('não emite bloco vazio para cerca sem fechamento nem citação vazia', () => {
    expect(parseRichText('texto\n```')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', value: 'texto' }] },
    ]);
    expect(parseRichText('>')).toEqual([]);
  });

  it('bloco cercado sai verbatim, sem interpretar nada dentro', () => {
    const blocks = parseRichText('```jsx\n<h1>a **b**</h1>\n- item\n```');
    expect(blocks).toEqual([{ type: 'code', language: 'jsx', value: '<h1>a **b**</h1>\n- item' }]);
  });

  it('linha só de hífens some em vez de virar texto cru na tela', () => {
    // A paginação por `---` saiu em 2026-07-31, mas o conteúdo de produção ainda
    // carrega o delimitador até a migração passar — e autor tem memória muscular.
    expect(parseRichText('antes\n\n---\n\ndepois').map((b) => b.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  it('as marcas do pense-antes perdem o prefixo, mas o texto fica', () => {
    // `?>`/`?=` viraram o kind `concept_reveal`. Enquanto produção não migra, o
    // aluno precisa continuar lendo a pergunta e a resposta — só o delimitador
    // sai, senão ele apareceria cru na tela.
    expect(parseRichText('?> Por que quebrou?\n?= Porque é prop.')).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', value: 'Por que quebrou?' }] },
      { type: 'paragraph', spans: [{ type: 'text', value: 'Porque é prop.' }] },
    ]);
  });

  it('hífen de lista continua lista', () => {
    expect(parseRichText('- um\n- dois')).toMatchObject([{ type: 'list', ordered: false }]);
  });

  it('dentro de bloco cercado o separador é conteúdo, não sintaxe', () => {
    expect(parseRichText('```\n---\n```')).toEqual([{ type: 'code', language: '', value: '---' }]);
  });

  it('texto sem marcação nenhuma sai como um parágrafo por bloco', () => {
    const texto = 'Regra prática: mudou por causa de um clique aqui dentro? Então é estado.';
    expect(parseRichText(texto)).toEqual([
      { type: 'paragraph', spans: [{ type: 'text', value: texto }] },
    ]);
  });
});
