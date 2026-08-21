# `data-source` e a captura — como o carimbo vira mapa clicável

Extraído verbatim do `CLAUDE.md` em 2026-08-21. As regras duras (nunca em
produção, o portão é `ITERA_SOURCE_STAMP=1`) continuam no `CLAUDE.md`; aqui está
como a coisa funciona e as armadilhas medidas.

### 🏷️ `data-source` — carimbo de build, SÓ em build de captura

`scripts/source-stamp.ts` é um plugin do Vite que escreve
`data-source="src/pages/HomePage.tsx:42"` em cada elemento HOST que os nossos
`.tsx` renderizam. Ele existe para o mapa de UX: com a caixa de cada elemento na
tela, clicar numa REGIÃO de um screenshot devolve o arquivo exato — sem modelo,
sem clonar o repo do outro lado.

🚨 **Nunca em produção.** O carimbo é peso morto para o aluno e publica o
layout de um repositório PRIVADO no DOM de quem abrir o dev tools.

⚠️ **O portão é `ITERA_SOURCE_STAMP=1` no ambiente do processo, e NÃO o `mode`.**
Um build de captura *é* um build em modo produção, então `mode !== "development"`
falharia ABERTO. Não troque por um teste de modo; o `componentTagger()` no
`vite.config.ts` é gatilhado assim e está certo, porque é ferramenta de dev
server — o caso aqui é o oposto.

Dois guardas, e cada um sozinho seria fraco:

- `npm run assert:no-source-stamp` — lê o `dist/` e exige **zero** carimbos.
  Roda no `build-test`, sobre o artefato que a release produziria.
- `npm run e2e:stamp` — o job `source-stamp` builda **com** a flag, resolve cada
  carimbo contra a árvore de arquivos (inclusive: a tag escrita naquela linha é a
  tag do elemento), e depois roda o **mesmo** detector exigindo que ele ache os
  carimbos. Um detector, dois builds, veredictos opostos.

Não são atribuídos: `@devfellowship/components`, `@iterahq/activities` e Radix —
todos compilados antes do Vite. Um elemento desses resolve pelo **ancestral
carimbado mais próximo**, que é o arquivo que montou o componente.

### 🗺️ A captura — `screenshot.png` + `regions.json`

`e2e/support/captureRegions.ts` é a camada clicável construída em cima do
carimbo. No momento do screenshot, com o DOM vivo, ela varre os elementos
carimbados e grava, **ao lado da imagem**, um `regions.json` com
`{ selector, file, line, componentName, tag, rect, area, depth, index }` por
elemento. `resolveRegionAt(regions, x, y)` devolve o arquivo exato de um clique.
Sem chamada de modelo, sem clonar o repo.

Os dois arquivos são um **par**: o JSON descreve a geometria de UMA imagem, no
espaço de pixels dela. Nenhum dos dois serve sozinho.

- **Região menor ganha.** Todo elemento carimbado está dentro dos ancestrais
  carimbados dele, então um ponto cai em várias regiões ao mesmo tempo. A menor
  caixa que contém o ponto é a mais específica. Empate: maior `depth`, depois
  ordem no documento — nunca aleatório.
- **`componentName` sai do AST, não do nome do arquivo**
  (`scripts/component-at-line.ts`). Um `map` minúsculo não rouba o nome do
  componente que o contém, e um arquivo com dois componentes reporta o certo.
- **A imagem é recortada no viewport, não `fullPage`.** `getBoundingClientRect()`
  fala em coordenadas de viewport, então um shot de viewport a `dpr: 1` divide um
  único espaço de coordenadas com os `rect`. O `fullPage` redimensiona o viewport
  para tirar a foto, o que move elementos `fixed`/`sticky` — o mapa descreveria
  um layout que a imagem não mostra.

🧊 **Estabilidade de pixel é contrato, e é testada.** Tudo que vem depois compara
dois screenshots e pergunta se o diff zerou. `npm run e2e:capture` captura a
mesma tela **duas vezes, em contextos novos**, e exige PNGs **byte a byte
iguais** — nas três telas, não só na mais fácil.

⚠️ **A parte que quase passou batido:** com viewport, relógio, `Math.random`,
fontes e animações já congelados, a captura do harness ainda variava **19 pixels
em 1.024.000**, em ~1 rodada a cada 3 — sempre ±1 numa borda arredondada, com o
`regions.json` idêntico. Era **rasterização**, não layout. Quem conserta é
`CAPTURE_LAUNCH_ARGS` (`--disable-gpu`, `--disable-partial-raster`, …), que só
funciona no **launch** do browser, nunca no contexto. Uma verificação rodada uma
vez só teria dado isso por resolvido em 2 de 3 tentativas.

⚠️ **Uma máquina, não duas.** A igualdade byte a byte é entre duas capturas no
MESMO host. A rasterização de glifo é do FreeType/fontconfig da máquina —
comparação entre máquinas diferentes exige um container só.
