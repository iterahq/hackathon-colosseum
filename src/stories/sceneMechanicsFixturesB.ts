/**
 * Storybook fixtures for the scene-mechanics batch B kinds (`wire`, `spot`,
 * `bucket`, `intercept`, `query`) — plan `20260924-itera-scene-mechanics-kinds`.
 *
 * Split out of `sceneMechanicsFixtures.ts` (batch A) to stay under the
 * 200-line file cap — see that file for `makeGatedActivity` and the release-
 * gate note both batches share.
 *
 * Specs are the real ported fixtures from `iterahq/activity-spec` PR #54
 * (`src/schemas/fixtures/scene-mechanics/<kind>.json`), first entry per kind.
 */

export const WIRE_SPEC = {
  prompt: 'Conecta cada tag ao papel dela na página.',
  reaction: 'Cada tag carrega um papel fixo — o navegador não inventa.',
  stamp: 'tag define papel',
  left_title: 'Tag',
  right_title: 'Papel',
  wrong_hint: 'essa tag não é isso — olha de novo o que ela costuma segurar.',
  left: [
    { id: 'tag-h1', label: 'h1' },
    { id: 'tag-p', label: 'p' },
    { id: 'tag-a', label: 'a' },
  ],
  right: [
    { id: 'titulo', label: 'título' },
    { id: 'paragrafo', label: 'parágrafo' },
    { id: 'link', label: 'link' },
  ],
  pairs: [
    { left_id: 'tag-h1', right_id: 'titulo' },
    { left_id: 'tag-p', right_id: 'paragrafo' },
    { left_id: 'tag-a', right_id: 'link' },
  ],
};

export const SPOT_SPEC = {
  guide: { name: 'Duda' },
  prompt: 'A página derreteu. Tapa o token exato que quebrou tudo.',
  reaction: "Faltava um 's' — 'clas' não é atributo nenhum.",
  stamp: 'um typo quebra tudo',
  file: 'index.html',
  lines: [[{ text: '<h1 ' }, { text: 'clas', bug_id: 'typo-clas' }, { text: '="titulo">Oi</h1>' }]],
  bugs: [
    {
      id: 'typo-clas',
      fixed_text: 'class',
      note: "faltava um 's' — 'clas' não é nenhum atributo que o navegador conhece.",
    },
  ],
  miss_hint: 'tenta de novo, token por token — o resto da linha está certo.',
};

export const BUCKET_SPEC = {
  prompt: 'Separa as unidades de medida CSS: absolutas de um lado, relativas do outro.',
  reaction: 'px e cm nunca escalam. rem, em, % e vw sempre escalam a partir de algo.',
  stamp: 'unidade absoluta vs relativa',
  chips: [
    { id: 'px', label: 'px', bucket: 'absoluta', hint: 'px é sempre o mesmo tamanho de pixel — não escala.' },
    { id: 'cm', label: 'cm', bucket: 'absoluta', hint: 'cm é medida do mundo real — fixa, não escala.' },
    { id: 'rem', label: 'rem', bucket: 'relativa', hint: 'rem é relativo ao tamanho da fonte do `html` — escala.' },
    { id: 'em', label: 'em', bucket: 'relativa', hint: 'em é relativo ao tamanho da fonte do PAI — escala.' },
    { id: 'porcento', label: '%', bucket: 'relativa', hint: '% é relativo a algo — escala.' },
    { id: 'vw', label: 'vw', bucket: 'relativa', hint: 'vw é relativo à largura da tela — escala.' },
  ],
  buckets: [
    { id: 'absoluta', label: 'ABSOLUTA', tone: 'blue' },
    { id: 'relativa', label: 'RELATIVA', tone: 'green' },
  ],
};

export const INTERCEPT_SPEC = {
  prompt: 'Um pedido sai do celular e viaja até o servidor. Tapa o nó onde o HTML é montado.',
  reaction: 'O servidor é quem monta a resposta — o navegador só desenha.',
  stamp: 'servidor monta, navegador desenha',
  packet: 'GET /',
  answer: 'servidor',
  wrong_hint: 'esse nó só recebe ou só desenha — não é ele que monta o HTML.',
  nodes: [
    { id: 'celular', label: 'celular', icon: '📱', x: 10, y: 50 },
    { id: 'rede', label: 'rede', icon: '📶', x: 40, y: 50 },
    { id: 'servidor', label: 'servidor', icon: '🖥️', x: 75, y: 50 },
  ],
  edges: [
    ['celular', 'rede'],
    ['rede', 'servidor'],
  ],
  path: ['celular', 'rede', 'servidor'],
};

export const QUERY_SPEC = {
  prompt: 'Só quero os bolos baratos e sem estoque. Liga as cláusulas certas.',
  reaction: 'WHERE filtra ANTES da tabela chegar até você.',
  stamp: 'WHERE filtra linhas',
  table: {
    name: 'bolos',
    columns: ['sabor', 'preco', 'estoque'],
    rows: [
      { id: '1', cells: ['ninho', 12, 4] },
      { id: '2', cells: ['brigadeiro', 8, 0] },
      { id: '3', cells: ['prestigio', 14, 2] },
      { id: '4', cells: ['limao', 9, 1] },
      { id: '6', cells: ['coco', 7, 3] },
    ],
  },
  base_sql: 'SELECT sabor, preco, estoque FROM bolos',
  clauses: [
    { type: 'where', id: 'preco-menor-10', chip: 'preço < 10', column: 'preco', cmp: '<', value: 10 },
    { type: 'where', id: 'estoque-zero', chip: 'estoque = 0', column: 'estoque', cmp: '=', value: 0 },
  ],
  goal: { row_ids: ['2'], ordered: false },
};
