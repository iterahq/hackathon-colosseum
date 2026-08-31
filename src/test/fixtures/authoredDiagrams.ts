import type { DiagramSpec } from '@iterahq/activity-spec';

/**
 * Os `kind=diagram` autorados para as aulas ao vivo do Educar+, copiados aqui
 * como fixture para que `authoredDiagrams.test.tsx` prove — a cada CI — que a
 * fonte continua DENTRO do subconjunto do `parseMermaidLite` e que todo
 * `highlight.term` continua casando com um nó do desenho.
 *
 * Essas duas propriedades quebram em SILÊNCIO. Fonte fora do subconjunto cai no
 * `<pre>` e `term` sem par vira um chip inerte: nos dois casos a tela ainda
 * aparece, ninguém vê erro, e a aula perde justamente o desenho que ela existe
 * para explicar. Um `-.->` colado da doc do mermaid ou um rótulo renomeado só
 * de um lado bastam.
 *
 * ⚠️ **Copiado VERBATIM da linha em produção**, não reescrito à mão a partir do
 * script de autoria — e a diferença importa. O `create_activity` do `itera-mcp`
 * embrulha `prompt`, `term` e `caption` em sacos `{pt, en}`, mas deixa o
 * `mermaid` como string crua. Uma fixture com strings puras em toda parte
 * compila, passa, e **não prova nada**: o `resolveLocalizedSpec` do teste vira
 * no-op e o caminho que o aluno de fato percorre fica sem guarda.
 *
 * ⚠️ Os tokens `{{eu.nome}}` também estão como no banco. O teste resolve pelo
 * `personalizeSpec` REAL antes de parsear, porque é o texto substituído que
 * chega ao parser — o nome do aluno entra DENTRO do rótulo `[card de ...]`,
 * então é ele que decide se o grafo ainda fecha.
 */
export const AUTHORED_DIAGRAMS: { slug: string; spec: DiagramSpec }[] = [
  {
    slug: 'listas-map-uma-volta-um-card',
    spec: {
      prompt: {
        pt: 'Uma lista entra, um card sai por item',
        en: 'Uma lista entra, um card sai por item',
      },
      mermaid: [
        'graph LR',
        '  L[lista pessoas] --> M(.map)',
        '  M -->|volta 1| A[card de {{eu.nome}}]',
        '  M -->|volta 2| B[card de {{familiar.nome}}]',
        '  M -->|volta 3| C[card de {{amigo.nome}}]',
      ].join('\n'),
      highlights: [
        {
          term: { pt: 'lista pessoas', en: 'lista pessoas' },
          caption: {
            pt: 'O dado guardado, lá em cima do arquivo. Sozinho ele não desenha nada.',
            en: 'O dado guardado, lá em cima do arquivo. Sozinho ele não desenha nada.',
          },
        },
        {
          term: { pt: '.map', en: '.map' },
          caption: {
            pt: 'A máquina do meio. Recebe a lista inteira e roda o SEU molde uma vez por item.',
            en: 'A máquina do meio. Recebe a lista inteira e roda o SEU molde uma vez por item.',
          },
        },
        {
          term: { pt: 'card de {{eu.nome}}', en: 'card de {{eu.nome}}' },
          caption: {
            pt: 'Uma volta, um card. Entrou nome novo na lista? Sai mais uma seta daqui, sozinha.',
            en: 'Uma volta, um card. Entrou nome novo na lista? Sai mais uma seta daqui, sozinha.',
          },
        },
      ],
    },
  },
];
