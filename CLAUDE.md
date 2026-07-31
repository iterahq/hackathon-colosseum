# CLAUDE.md — itera-player

> **Este arquivo é REPO-OWNED.** Até 2026-07-28 ele carregava um bloco
> `<!-- BEGIN GENERATED:claude/base -->` herdado do scaffold gerenciado de
> `devfellowship/dfl-iterate` (o commit de fundação deste repo foi um re-skin
> daquele projeto). Esse bloco descrevia o **engine gamificado legado**, que
> foi aposentado neste PR — ou seja, um agente que lesse só o CLAUDE.md ia
> testar/alterar código que nem existe mais.
>
> O scaffold foi removido, e não apenas corrigido, porque **este repo nunca foi
> alvo da distribuição**: o `registry/distribution-manifest.yaml` do `dfl-hq`
> só conhece `devfellowship/dfl-iterate` (batch-3, `readiness:
> collect-required`), e o pipeline inteiro está em `execution_mode: stage-only`
> com `apply_writes_enabled: false` — `dfl-hq:scripts/context/apply.mjs` aborta
> antes de escrever em qualquer repo filho. `iterahq/itera-player` não aparece em
> lugar nenhum daquele registry. Nada sincroniza este arquivo; editá-lo aqui
> não gera conflito em lugar nenhum, e o CLAUDE.md do próprio `dfl-iterate`
> segue válido lá (o engine gamificado É o engine principal *daquele* repo).
>
> Se um dia alguém ligar a distribuição para cá, a ausência de marcadores é o
> comportamento seguro: o merge é `marker-required` com
> `missing_markers: hard-stop` — ele falha alto em vez de sobrescrever isto em
> silêncio.

## Quick Context

**Itera player** — o app do aluno/instrutor da Itera (`app.iterahq.dev`).
Roda lições e **activities** vindas do Supabase da Itera (`kjefmwlopzeaqgqtlbdn`),
com aula ao vivo (live class), superfície de autoria e back-office admin.

React SPA (Vite + TypeScript), Monaco Editor (self-hosted), Framer Motion,
shadcn/ui + `@devfellowship/components`, Tailwind, TanStack Query, Supabase Auth.

## Architecture

```
src/
├── pages/
│   ├── LessonPlayer.tsx      # o player canônico da lição (/lesson/:lessonId)
│   ├── LiveSessionPage.tsx   # aula ao vivo, lado do aluno
│   ├── live/                 # lado do instrutor (class, session, report)
│   ├── author/               # superfície de autoria (canvas, harness de teste)
│   ├── admin/                # back-office (roster, programs, engagement…)
│   ├── auth/                 # login, signup, OTP, reset, callback do DFL
│   └── HomePage · CatalogPage · ProgramPage · ProfilePage · Artifacts · Subscribe…
├── components/
│   ├── branded/
│   │   └── activity/         # 🎯 O ENGINE DE ACTIVITY CANÔNICO (ver abaixo)
│   ├── live/                 # stage, timer, roster, podium, sound dock
│   ├── author/ · admin/      # UI de autoria e back-office
│   ├── artifacts/            # browser de artifacts do aluno
│   ├── branded/              # ProgramCard, SkillTree, catálogo, badges…
│   ├── editor/               # CodeEditor (Monaco) + monacoTypescript
│   ├── auth/ · profile/ · layout/
│   └── ui/                   # shadcn/ui — NÃO editar à mão
├── utils/
│   ├── answerMachine.ts      # máquina pura de estado de resposta (T0)
│   └── liveActivityGate.ts   # gate puro do ao-vivo (enabled/locked/readOnly)
├── hooks/                    # useContent, useClassSession, useCodeSnack, useLiveClass…
├── services/                 # programs · progress · liveClass · membership · artifact…
├── types/content.ts          # Activity, ActivityKind, ProgressStatus (canônicos)
├── stories/                  # stories canônicas + contractFixtures.ts
├── i18n/                     # dicionário PT/EN
└── test/                     # Vitest
```

## 🎯 O engine de activity canônico

**`src/components/branded/activity/` + `ActivityRenderer.tsx`.** É o único
engine. Ele despacha uma linha de `itera.activities` para a view certa pelo
campo `kind`.

Os **12 kinds** de `itera.activity_kind`. Desde 2026-07-28 `src/types/content.ts`
**RE-EXPORTA** `ActivityKind` de `@iterahq/activity-spec` (antes era uma união
literal copiada à mão, que dizia espelhar o pacote e podia sair de sincronia).
Restam dois pontos a sincronizar na mão: o enum do banco e o `ACTIVITY_KINDS` de
`iterahq/itera-mcp:src/tools/activities.ts`.

`concept` · `concept_reveal` · `document` · `diagram` · `video` ·
`quiz` (o *hero*) ·
`single_choice` · `multi_choice` · `match` · `order` · `code` ·
`sandbox_scenario`

Rotas que montam o engine: **`/lesson/:lessonId`** (LessonPlayer),
**`/programs`/`/catalog`** (navegação), **`/live/*`** (aula ao vivo, aluno e
instrutor), **`/author/activities/:activityId/test`** e **`/test-live`**
(harness isolado — monta UMA activity, `onComplete` cai num sink em memória,
**zero escrita no DB**).

### Camadas puras (teste barato, sem React)

- **`src/utils/answerMachine.ts`** — `answerMachine(input) → viewState`
  (`shown`, `locked`, `canSubmit`, `gradeResult`) + `choiceOptionState()`.
  Consumida por `SingleChoice`, `MultiChoice`, `Match`, `Order`, o `Quiz`
  inline do `ActivityRenderer` e `byoc/ByocTree`. **Não reintroduza a lógica
  derivada inline nos componentes** — foi deduplicada de propósito.
- **`src/utils/liveActivityGate.ts`** — `learnerActivityGate({timerRunning,
  expired, answered})` → `{started, locked, readOnly, canComplete}`. Única
  fonte de verdade de quando o aluno pode responder ao vivo.
- **`@iterahq/activity-spec/runtime`** — reducers puros do `ChatModel` do
  `sandbox_scenario`. O hook `useSandboxScenario` só liga reducer a
  `useState`; todo julgamento é do runtime.

### Validação de spec

**Fail-closed nos 12 kinds desde 2026-07-28** (ADR-15 do plano
`20260728-itera-activity-testing`; supersede o ADR-13, que dava essa fronteira
ao plano irmão de back-office). Antes, `safeParseActivitySpec(kind, spec)` (do
`@iterahq/activity-spec`, vendorizado como `.tgz`) era chamado só em **`code`** e
**`sandbox_scenario`** e os outros 9 kinds recebiam o `spec` por cast.

- **Onde:** `src/utils/activitySpecBoundary.ts` (registro + veredito + auditor) e
  o `ActivityRenderer`, que valida antes do switch de kind. `code` e
  `sandbox_scenario` seguem validando dentro do próprio componente
  (`site: 'component'`), com os testids históricos `code-invalid` /
  `sandbox-invalid`. Card único: `InvalidSpecCard` (`data-invalid-spec="true"`).
- **Kind novo sem cobertura = CI vermelho**, por dois caminhos: o
  `Record<ActivityKind, …>` do registro (erro de `npm run typecheck`, que é gate
  de build) e `src/test/activityKindValidationCoverage.test.tsx`. A cláusula
  `satisfies` interna do pacote NÃO ajuda aqui — o `.tgz` vem pré-compilado.
- **BYOC é camada, não kind** — duas isenções deliberadas: o harness
  (`resolveByocSpec`, roda antes da fronteira) e o BYOC ao vivo (`isByocLive`,
  contrato sem Zod porque a resposta vem de LLM real). Validar `sandbox_scenario`
  em bloco quebraria o caminho ao vivo.
- **Lacuna declarada:** `document`, `diagram` e `quiz` têm schema **stub loose**
  (`z.record`) no pacote — `safeParseActivitySpec('quiz', {})` PASSA. Ali
  "validado" só quer dizer "é um objeto JSON". Apertar isso é mudança no repo
  `iterahq/activity-spec` (bump + re-vendor), não aqui.

### Fixtures — uma fonte de verdade

`src/stories/contractFixtures.ts` é o registry de contratos por kind, e
`src/test/activityContractFixtures.test.ts` já é um guard: **todo kind do enum
precisa de contrato, e todo contrato precisa passar no Zod do seu kind**. Kind
novo sem fixture = CI vermelho. Use as MESMAS fixtures nas stories e nos
testes — não crie um segundo conjunto.

## How to Work Here

- `npm run dev` — dev server
- `npm run lint` · `npm run typecheck` · `npm run build` · `npm test`
  (Vitest). **`typecheck` faz parte do gate do build** — deletar arquivo sem
  limpar import quebra o CI.
- `npm run storybook` — vitrine; publicada em `storybook.iterahq.dev` no push
  para `main` (PR é build-only, sem preview).
- E2E Playwright fica em `e2e/`, **fora do gate por PR** (`workflow_dispatch` +
  cron diário), todos capability-gated.

## Contracts

- **Activity**: linha de `itera.activities` com `kind` + `spec` (JSON validado
  por kind pelo Zod do `@iterahq/activity-spec`). O `ActivityRenderer`
  despacha; cada kind tem sua view em `branded/activity/`.
- **Progresso**: `ProgressStatus` (`todo` · `in_progress` · `done`) em
  `src/types/content.ts`; gravação via `services/progress.service.ts`.
- **Dados**: `componente → hook de query (useQuery) → service (async) →
  Supabase`. Referência: `src/pages/HomePage.tsx` + `src/hooks/useContent.ts` +
  `src/services/programs.service.ts`. Query key SEMPRE pela factory em
  `src/lib/queryKeys.ts` — nunca string solta. O componente trata `isPending` /
  `isError` (com `refetch()`) / sucesso.
- **Ao vivo**: `services/liveClass.service.ts` + `hooks/useClassSession.ts`;
  o gate do aluno é o `learnerActivityGate`.
- **Schema**: a Itera tem projeto Supabase próprio (`kjefmwlopzeaqgqtlbdn`),
  **independente do `dfl-schema`**, e o schema mora **NESTE repo** em
  `db/migrations/` (schema-in-monorepo, ADR-F1 / ADR-3 / ADR-26). ⚠️ Migrations
  são aplicadas **à mão** — nenhum workflow toca `db/`, então **mergear não
  aplica nada**; alguém roda `db/scripts/apply-migrations.sh` depois. Como não há
  ledger e o script re-roda tudo desde o `0001`, **toda migration precisa ser
  idempotente**. Detalhes (RLS, pooler `aws-1`, recuperação de run parcial) em
  [`db/README.md`](db/README.md) — leia antes da primeira migration.

## Rules

- Não editar `src/components/ui/` — shadcn/ui gerenciado.
- Kind novo de activity precisa de: entrada em `ActivityKind`
  (`src/types/content.ts`), view em `src/components/branded/activity/`,
  contrato em `src/stories/contractFixtures.ts` (o guard exige) e story.
- Imports absolutos (`@/components`, `@/hooks`, …); relativos só dentro da
  mesma feature.
- Lógica derivada de resposta/correção vai para `answerMachine`, não inline no
  componente.

## Story/Component ownership

This repo has two distinct spaces for Storybook stories — agents and humans
MUST follow this split:

- **`design-playground/`** (repo root) — the **designer's brainstorm space**.
  **johnoak (designer) always deploys his changes HERE.** He is free to
  experiment, prototype, and iterate without review gates. Stories here are
  discovered by Storybook via a dedicated glob entry in
  `.storybook/main.ts` (`../design-playground/**/*.stories.@(ts|tsx)`) —
  kept separate from the canonical `src/**` glob on purpose.
- **`src/stories/` + `src/components/`** — the **canonical** stories and
  components folders. **Updatable only by developers (`@taigfs` and
  `@SamuelStefano`).** Designer changes to canonical components/stories must
  go through a developer (open a PR, tag a developer as reviewer/co-author —
  don't push directly to `src/stories/` or `src/components/` as the
  designer).
- This is enforced by `.github/CODEOWNERS` (`design-playground/` →
  `@johnoak`; `src/stories/` + `src/components/` → `@taigfs`
  `@SamuelStefano`). Do not weaken or remove those CODEOWNERS entries
  without explicit sign-off from a developer.
- When promoting a design-playground experiment into the canonical set, a
  developer moves/adapts the story into `src/stories/` (and the component
  into `src/components/`) as part of a normal reviewed PR — it does not
  happen by widening design-playground's write access.

## 🚨 Zero fetch de CDN externa em runtime

**Regra dura: nada que o aluno PRECISA para trabalhar pode vir de CDN pública
em runtime.** As aulas rodam em rede de escola/comunidade, onde CDN bloqueada
ou estrangulada é cenário realista — e um asset crítico que não carrega
significa aula perdida.

O que já é servido do nosso domínio, a partir de `public/vendor/`:

| Asset | Origem | Como chega em `public/vendor/` |
| --- | --- | --- |
| React UMD (`react` + `react-dom`) | preview do snack (`<iframe sandbox>`) | commitado |
| Tailwind Play (`tailwind-play-cdn.js`) | preview do snack | commitado |
| **Fontes da marca** (`vendor/fonts/*.woff2`, ~313 KB) | Barlow Condensed · Inter · JetBrains Mono | **commitado** |
| **Monaco Editor** (`vendor/monaco/vs`, ~16 MB) | editor de código | **gerado no build** (`.gitignore`) |
| **Efeitos sonoros** (`vendor/sfx/*.mp3`, ~250 KB) | acerto/erro/avanço na lição e na aula | **commitado** |

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

`src/test/sfxSelfHost.test.ts` tranca isso (sem rede): nenhuma URL absoluta no
hook, todo som apontando pra `/vendor/sfx`, e cada arquivo com cabeçalho de MP3
de verdade. Se ele quebrar, o som voltou a depender de CDN — não silencie o
teste.

## Edge Functions

Este repo **não tem** `supabase/functions/`, e não existe workflow
`push-functions.yml` aqui. Uma versão anterior desta seção (herdada do scaffold
do `dfl-iterate`) mandava abrir PR de edge function no `dfl-schema` — as edge
functions da DFL vivem lá, mas **não têm nada a ver com a Itera**, que roda em
projeto Supabase próprio. Se a Itera vier a precisar de uma, ela vai no projeto
da Itera; decida e documente antes, não replique o fluxo da DFL por reflexo.
