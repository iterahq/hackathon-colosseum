# Vendoring sem CDN — Monaco, fontes e efeitos sonoros

Extraído verbatim do `CLAUDE.md` em 2026-08-21. A regra dura ("nada que o aluno
precisa vem de CDN pública em runtime") e a tabela de assets continuam no
`CLAUDE.md`; aqui está por que cada script de vendoring existe, o que foi medido
em produção quando a CDN caiu, e por que Monaco é gerado no build enquanto fontes
e SFX são commitados.

### Monaco — por que existe `scripts/vendor-monaco.ts`

`@monaco-editor/react` delega o carregamento ao `@monaco-editor/loader`, que
por padrão injeta em RUNTIME um `<script src="https://cdn.jsdelivr.net/npm/monaco-editor@X/min/vs/loader.js">`.
Medido em produção (2026-07-23) com a jsDelivr bloqueada: **o editor não montava
— 0 linhas, aluno sem editor nenhum.**

O fix tem três peças, e as três precisam continuar existindo:

1. **`monaco-editor` é dependência DIRETA e com pin exato** (`package.json`) —
   a versão acompanha o default do `@monaco-editor/loader`. Ao bumpar
   `@monaco-editor/react`, confira `node_modules/@monaco-editor/loader/lib/es/config/index.js`
   e realinhe o pin.
2. **`scripts/vendor-monaco.ts`** copia `monaco-editor/min/vs` (build AMD) para
   `public/vendor/monaco/vs`. Roda pelo plugin `monacoSelfHost` do Vite
   (`buildStart` → cobre `vite dev`, `vite build` e o Storybook) e pelos hooks
   `prebuild`/`prebuild-storybook`. É idempotente (carimbo `.monaco-version`).
   Os arquivos **não são commitados** — são gerados no build.
3. **`src/lib/monaco-loader.ts`** roda `loader.config({ paths: { vs: '/vendor/monaco/vs' } })`
   **uma vez no bootstrap** — importado por `src/main.tsx` e `.storybook/preview.tsx`.
   ⚠️ Não mova essa chamada para dentro do `CodeEditor`: ela precisa acontecer
   antes do primeiro mount do editor.

`src/test/monacoSelfHost.test.ts` tranca as três pernas. Se ele quebrar, o
editor voltou a depender de CDN — não silencie o teste.

### Fontes — por que existe `scripts/vendor-fonts.ts`

O `index.html` carregava um `<link>` pro CSS do Google Fonts, que puxa os
`.woff2` do gstatic. Medido em produção (2026-07-23) com tudo bloqueado exceto
o app e o Supabase: **zero faces carregadas** — a Barlow Condensed dos títulos
renderizava com a MESMA largura do `sans-serif` do sistema (1027.97px vs 760px
da fonte real). Fallback silencioso: nada quebra, mas a aula fica com cara de
página quebrada.

Diferente do Monaco, os `.woff2` **são commitados**. Motivo: não existe pacote
npm dessas fontes no projeto. Um script no `prebuild` teria que buscá-las do
gstatic NA HORA DO BUILD — só moveria a dependência externa de runtime pra CI, e
quebraria qualquer build atrás da mesma rede restrita que estamos endurecendo.
São 12 arquivos / ~313 KB, imutáveis (as URLs do gstatic são versionadas por
revisão da família). O Monaco é o oposto: 16 MB copiáveis offline do
`node_modules`, então gerar no build é melhor.

- **`scripts/vendor-fonts.ts`** (`npm run vendor:fonts`) rebaixa os `.woff2` +
  gera `public/vendor/fonts/fonts.css`. **NÃO** roda no `prebuild` — build não
  pode depender de rede. Rodar à mão e commitar o diff.
- **Escopo**: a const `FAMILIES` espelha EXATAMENTE o que o `<link>` do Google
  servia (Barlow Condensed 400/500/600/700, Inter 400/500/600/700, JetBrains
  Mono 400/500) → renderização idêntica por construção. Subsets `latin` +
  `latin-ext`. ⚠️ Os acentos do PT (ç, õ, ã) moram em U+00C0–U+00FF, ou seja no
  subset **`latin`** — não no `latin-ext`.
- **Dois `<link>`**: `index.html` (app) **e** `.storybook/preview-head.html` — o
  Storybook tem `iframe.html` próprio e não herda o do app.
- Comentários evitam os hostnames literais de propósito, pra um grep de
  auditoria por CDN externa no `dist/`/`storybook-static/` dar zero.

`src/test/fontsSelfHost.test.ts` tranca tudo isso (sem rede). Se ele quebrar, a
tipografia voltou a depender de CDN — não silencie o teste.

### Efeitos sonoros — por que existe `scripts/vendor-sfx.ts`

`useSoundEffects` apontava pros `.mp3` de um CDN público de SFX. Na rede do
piloto (só o app + o Supabase liberados) o aluno passa o exercício e não ouve
nada. E a origem nem é estável: em 2026-07-30 o clipe de comemoração respondia
**403** — ou seja, aquele som já estava morto em produção para todo mundo.

Seguem o caminho das FONTES, não o do Monaco: **commitados** (6 arquivos,
~250 KB), porque não há pacote npm de origem e um fetch no `prebuild` só moveria
a dependência externa pra CI.

- **`scripts/vendor-sfx.ts`** (`npm run vendor:sfx`) baixa os clipes e grava em
  `public/vendor/sfx/`. **NÃO** roda no `prebuild`. Rodar à mão e commitar.
- O mapa `CLIPS` (id na origem → nome do arquivo) é a documentação de qual
  clipe é qual. Trocou um? Registre o porquê ali.
- O script rejeita resposta cujo `content-type` não comece com `audio/`:
  portal cativo de rede responde 200 com HTML, que viraria um `.mp3` quebrado.

Quem toca é `src/lib/soundEngine.ts` (Web Audio): o mapa de clipes mora em
`src/lib/soundClips.ts`, a lição busca os dela ao abrir (não no primeiro
veredito) e cada clipe é decodificado uma vez só. O nginx do `Dockerfile` serve
`/vendor/sfx/` com `Cache-Control` de 7 dias — os nomes não têm hash, então
trocar um clipe pede nome novo ou espera do cache.

`src/test/sfxSelfHost.test.ts` tranca isso (sem rede): nenhuma URL absoluta no
engine nem no hook, todo som apontando pra `/vendor/sfx`, e cada arquivo com cabeçalho de MP3
de verdade. Se ele quebrar, o som voltou a depender de CDN — não silencie o
teste.
