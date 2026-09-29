# CLAUDE.md — itera-player

> **Este arquivo é REPO-OWNED.** Nada sincroniza ele — `iterahq/itera-player` não
> aparece no registry de distribuição do `dfl-hq`, e o pipeline está em
> `stage-only` com `apply_writes_enabled: false`. Editar aqui não gera conflito
> em lugar nenhum. Por que o bloco `BEGIN GENERATED:claude/base` do scaffold foi
> REMOVIDO e não corrigido (2026-07-28):
> [`docs/claude-md-scaffold.md`](docs/claude-md-scaffold.md).

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


⚠️ **Desde a Fase C (2026-08-07), DEZ kinds NÃO moram mais aqui.** `concept`,
`concept_reveal`, `video`, `single_choice`, `multi_choice`, `match`, `order`,
`chat_sandbox`, `terminal_sandbox` e `code` foram extraídos para
**`@iterahq/activities`**, junto com os primitivos e a lógica pura. Os arquivos
em `src/components/branded/activity/<Kind>` viraram **re-export de uma linha**:
todo import antigo segue valendo, mas **editar o arquivo aqui não muda nada** — a
implementação está no pacote.

📦 **`code` sai por um SEGUNDO entrypoint, `@iterahq/activities/code`** (ADR-5), e
de propósito não está em `BUILT_IN_ACTIVITY_KINDS`.
`scripts/assert-entrypoint-isolation.mjs` falha se o bundle base alcançar
qualquer coisa de `code/`.

🔌 **O que a activity precisa do host entra por PORTA injetada** — `i18n` · `api` ·
`identity` · `theme` · `storage` · `codeEditor` — nunca por import direto de
`@/api/*`, `@/auth/*` ou `@/services/*`. O adapter é
`src/components/branded/activity/IteraActivityHost.tsx`;
`src/test/activityPublicContract.test.ts` fica vermelho se um renderer crescer
uma prop fora do contrato.

📖 **Antes de mexer no engine, leia
[`docs/activity-engine.md`](docs/activity-engine.md).** Lá estão, com o porquê de
cada uma: o que ficou no app e por quê (Monaco, `sandbox-live`, BYOC, os três
kinds inline), as camadas puras (`answerMachine`, `liveActivityGate`, o runtime
dos dois sandboxes), a validação **fail-closed** de spec, as fixtures de contrato,
o monorepo de npm workspaces e os dois gates que a borda do workspace NÃO prova
(`external-consumer/` e o glob do Tailwind).

<!-- activity-kinds:begin — bloco VERIFICADO por scripts/verify-activity-kinds.mjs.
     A lista e a contagem aqui dentro são comparadas com o enum derivado de
     db/migrations/*.sql. Editar um nome ou um número sem editar o enum = CI
     vermelha. Não remova os marcadores para calar o check. -->

Os **47 kinds** de `itera.activity_kind`. Desde 2026-07-28 `src/types/content.ts`
**RE-EXPORTA** `ActivityKind` de `@iterahq/activity-spec` (antes era uma união
literal copiada à mão, que dizia espelhar o pacote e podia sair de sincronia).
Resta um ponto a sincronizar na mão: o `ACTIVITY_KINDS` de
`iterahq/itera-mcp:src/tools/activities.ts`.

`concept` · `concept_reveal` · `document` · `diagram` · `video` ·
`quiz` (o *hero*) ·
`single_choice` · `multi_choice` · `match` · `order` · `code` ·
`chat_sandbox` · `terminal_sandbox` · `sandbox_scenario` ·
`xray` · `live_type` · `inspect` (as cenas, migration `0107`) ·
`dial` · `plug` · `selector` · `timeline` · `arrange` · `press` ·
`wire` · `spot` · `bucket` · `intercept` · `query`
(scene-mechanics, migration `0108`, `@iterahq/activity-spec` 1.4.0)

Os dezenove kinds de COMPORTAMENTO (migration `0104`, plano
`20260924-activity-type-one-behavior-rule`: um activity type = um
comportamento; os kinds antigos ficam na lista de transição):
`code_editor_checks` · `code_editor_ungraded` · `code_fill_bank` · `code_fill_select` · `code_fill_type` ·
`chat_compose` · `chat_fill_select` · `chat_fill_type` · `chat_pick_context` · `chat_rate_reply` ·
`terminal_type_command` · `terminal_pick_command` · `terminal_build_command` ·
`document_read` · `document_reflect` · `document_ai_judge` ·
`byoc_pick_best` · `byoc_judge_each` · `byoc_build_context`

<!-- activity-kinds:end -->

⚠️ **`sandbox_scenario` está DEPRECADO, não retirado.** Zero linhas o carregam
(medido no banco em 2026-08-13), mas o Postgres não tem
`ALTER TYPE … DROP VALUE` — o valor **fica no enum permanentemente**. O app
renderiza **13**; uma linha com esse kind cai no `UnknownActivity`
(`data-activity-kind="unknown"`), não numa tela em branco. Detalhe em
[`docs/activity-engine.md`](docs/activity-engine.md).

Rotas que montam o engine: **`/lesson/:lessonId`** (LessonPlayer),
**`/programs`/`/catalog`** (navegação), **`/live/*`** (aula ao vivo, aluno e
instrutor), **`/author/activities/:activityId/test`** e **`/test-live`**
(harness isolado — monta UMA activity, `onComplete` cai num sink em memória,
**zero escrita no DB**).

## How to Work Here

- `npm run dev` — dev server
- `npm run lint` · `npm run typecheck` · `npm run build` · `npm test`
  (Vitest). **`typecheck` faz parte do gate do build** — deletar arquivo sem
  limpar import quebra o CI.
- `npm run storybook` — vitrine; publicada em `storybook.iterahq.dev` no push
  para `main`. **Toda PR publica um preview próprio** em
  `https://pr-<n>.itera-storybook.pages.dev` (alias de branch do mesmo projeto
  Pages). O alias sai do NÚMERO da PR, não do nome da branch, porque o webhook
  de design monta esse link antes de o build terminar — nome de branch com `/`
  ou acento tornaria a URL imprevisível.
- **Esteira de design — este repo TEM rota** (`work.design_task_routes`). PR do
  próprio repo que toca `design-playground/` **cria o card sozinha** (etapa
  `decision`, epic "Design ↔ implementation flow"). Não crie o card à mão antes;
  se o card já existe, ponha o `DFL-xxx` dele na PR — o webhook liga a PR a ele
  e não abre um segundo. Método: skill `storybook-design-pr`.
- E2E Playwright fica em `e2e/`, **fora do gate por PR** (`workflow_dispatch` +
  cron diário), todos capability-gated. **Duas exceções hermeticas, blocantes
  em toda PR:** `npm run e2e:baseline` (caracterização de activity) e
  `npm run e2e:stamp` (o carimbo `data-source` **e** a captura do mapa, abaixo —
  dois projects, um servidor, uma invocação só). As duas rodam contra um
  `vite preview` da própria árvore, sem credencial nenhuma.


### 🏷️ `data-source` — carimbo de build, SÓ em build de captura

`scripts/source-stamp.ts` é um plugin do Vite que escreve
`data-source="src/pages/HomePage.tsx:42"` em cada elemento HOST que os nossos
`.tsx` renderizam, para o mapa de UX: clicar numa região de um screenshot devolve
o arquivo exato, sem modelo e sem clonar o repo.

🚨 **Nunca em produção.** O carimbo é peso morto para o aluno e publica o layout
de um repositório PRIVADO no DOM de quem abrir o dev tools.

⚠️ **O portão é `ITERA_SOURCE_STAMP=1` no ambiente do processo, e NÃO o `mode`.**
Um build de captura *é* um build em modo produção, então `mode !== "development"`
falharia ABERTO. Não troque por um teste de modo.

Dois guardas, e cada um sozinho seria fraco: `npm run assert:no-source-stamp` lê
o `dist/` e exige **zero** carimbos; `npm run e2e:stamp` builda **com** a flag e
exige que o **mesmo** detector os ache. Um detector, dois builds, veredictos
opostos.

📖 Como o carimbo vira mapa clicável — `regions.json`, "região menor ganha",
viewport e não `fullPage`, e a armadilha de rasterização que valia 19 pixels em
1 rodada a cada 3: [`docs/source-stamp-e-captura.md`](docs/source-stamp-e-captura.md).

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
  `db/migrations/` (schema-in-monorepo, ADR-F1 / ADR-3 / ADR-26). ✅ **Mergear
  para `main` APLICA a migration** — workflow `db-apply` (desde 2026-08-04),
  com ledger `itera.schema_migrations` (cada arquivo aplica uma vez só) e
  detecção de checksum. Antes disso era à mão, e 0036/0037/0038 ficaram dias
  mergeadas-e-não-aplicadas. **Toda migration continua tendo que ser
  idempotente** — o ledger protege contra re-aplicação *conhecida*, não contra
  restore de backup / bootstrap / ambiente novo. Detalhes (RLS, pooler `aws-1`,
  drift diário, recuperação de run parcial) em
  [`db/README.md`](db/README.md) — leia antes da primeira migration.

## Rules

- Não editar `src/components/ui/` — shadcn/ui gerenciado.

- **Kind novo de activity** precisa, no mínimo, de: entrada em `ActivityKind`
  (`src/types/content.ts`, que **re-exporta** de `@iterahq/activity-spec`), view
  em `src/components/branded/activity/` (ou em `packages/activities/src/kinds/`
  se não depender de backend — nesse caso também uma fixture em
  `external-consumer/fixtures.json`), contrato em
  `src/stories/contractFixtures.ts`, entrada em `ACTIVITY_FAMILY`
  (`src/utils/activityFamilies.ts`), story **e emissão de evento de tracking de
  aprendizagem** (plano
  [`20260731-itera-eventos-aprendizagem`](https://plans.devfellowship.com/20260731-itera-eventos-aprendizagem)).
  O motivo de a última entrar na lista é o motivo do plano existir: **não dá pra
  voltar no tempo e coletar o dado.**
  - **ONDE emitir: DENTRO de `persistActivityProgress`**
    (`src/services/progress.service.ts`), na FUNÇÃO e nunca nos call-sites — eles
    já se moveram uma vez. **NUNCA dentro do `ActivityRenderer`:**
    `src/components/author/ActivityTestHarness.tsx` deliberadamente não importa o
    `progress.service`, e é essa fronteira que impede que um autor testando
    polua dado de aluno.
  - **A FAMÍLIA vem primeiro.** `src/utils/activityFamilies.ts` nomeia as cinco
    (`selection` · `arrangement` · `reading` · `editor` · `scenario`) e é ela que
    define o vocabulário de ação. Kind sem família **não compila**. Critério pra
    saber se a família está certa: *kind novo dentro de família existente custa
    DADO + PREDICADO; se custar máquina de estado nova, a fronteira está errada.*
  - **Nunca ponha texto livre no `payload`** do trace — a resposta do aluno tem UM
    lugar (`activity_results.feedback.response`). Exceção única, autorizada e
    enumerada em `FREE_TEXT_PAYLOAD_CARVE_OUTS`: `command_run.command` do
    `terminal_sandbox`, **só na forma normalizada**. ⚠️ **Não "conserte" essa
    exceção achando que é bug** — é decisão do Tainan, e o porquê está no doc.
  - **`FAMILY_EMITTED` é ledger, não meta** — só liste família que este build
    realmente emite. `scenario` é **parcial** (`terminal_sandbox` emite,
    `chat_sandbox` não): quem consulta `activity_traces` filtra por `kind`.
  - **⚠️ `activity_traces` tem DUAS espécies de linha desde a 0040** — a tentativa
    liquidada e a **abandonada**. Os dois predicados portáteis: liquidadas →
    `where outcome is distinct from 'abandoned'`; abandonos →
    `where outcome = 'abandoned'`. **Nunca `where outcome = 'settled'`** numa
    população histórica: NULL ali é *"não capturado"*, não *"liquidada"*.
  - **Um abandono NÃO escreve `activity_results` nem `progress`** — tem função
    própria (`persistActivityAbandonment`) em vez de uma flag, para que a escrita
    errada seja *inalcançável*, não só improvável. E abandono **não é prova de
    dificuldade**: compare taxas entre atividades irmãs, nunca leia a linha
    isolada.
  - **O cano já existe — use, não reinvente.** Contrato versionado em
    `src/utils/learningTrace.ts`; contexto pedagógico em
    `src/utils/pedagogicalContext.ts`. Ação nova é acréscimo (novo `type`, nova
    chave de `payload`), **sem** bump de `schema_version` e **sem** migration.
  - **O que a CI TRAVA:** typecheck do `Record<ActivityKind, …>`, contrato e
    fixture, cobertura de validação, família (nas duas direções) e a fronteira de
    emissão (`src/test/traceEmissionBoundary.test.ts`). 🔴 **O que ela NÃO trava:**
    não existe checker que exija que um kind novo EMITA evento — é a Fase 5, não
    construída. Não conte com a CI pra isso, e não descreva em PR como se ela
    pegasse.
  - **A lista canônica de kinds é a do PACOTE** (`ACTIVITY_KINDS` de
    `@iterahq/activity-spec`, **13**), não a do enum (**14**, com o
    `sandbox_scenario` aposentado que não sai). Quem construir a Fase 5 parte
    dela, não do enum e não de uma terceira.
  - 📖 **O racional inteiro está em
    [`docs/learning-trace.md`](docs/learning-trace.md)** — por que cada regra
    acima existe, o que já custou caro, a escada de degradação (`traceWriteRungs`),
    por que a entrega no teardown é fila durável e não `sendBeacon`, e por que
    hoje só o `LessonPlayer` é superfície de abandono. **Leia antes de mexer em
    trace, família, contexto pedagógico ou abandono.**
  - Precisa de coluna/tabela nova? Só se o acréscimo acima não resolver.
    Migration **idempotente** em `db/migrations/`; o merge para `main` aplica —
    ver *Contracts → Schema* e [`db/README.md`](db/README.md). Nunca
    `devfellowship/dfl-schema`: aquele é o banco da DFL, outro projeto.

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

Os três vendorings existem porque cada um **já falhou em produção** com a CDN
bloqueada: o Monaco não montava (aluno sem editor nenhum), as fontes caíam em
fallback silencioso (a aula fica com cara de página quebrada) e o clipe de
comemoração respondia **403**. Monaco é **gerado no build** (16 MB, copiáveis
offline do `node_modules`); fontes e SFX são **commitados**, porque não há pacote
npm de origem e buscá-los no `prebuild` só moveria a dependência externa de
runtime para a CI.

`src/test/monacoSelfHost.test.ts`, `src/test/fontsSelfHost.test.ts` e
`src/test/sfxSelfHost.test.ts` trancam as três pernas. **Se um deles quebrar, o
asset voltou a depender de CDN — não silencie o teste.**

📖 As três peças do fix do Monaco (pin exato, `vendor-monaco.ts`, o
`loader.config` no bootstrap), o escopo exato das famílias de fonte — e por que os
acentos do PT moram no subset `latin` e não no `latin-ext` — e o mapa `CLIPS` dos
SFX: [`docs/vendoring-sem-cdn.md`](docs/vendoring-sem-cdn.md).

## Edge Functions

Este repo **não tem** `supabase/functions/`, e não existe workflow
`push-functions.yml` aqui. Uma versão anterior desta seção (herdada do scaffold
do `dfl-iterate`) mandava abrir PR de edge function no `dfl-schema` — as edge
functions da DFL vivem lá, mas **não têm nada a ver com a Itera**, que roda em
projeto Supabase próprio. Se a Itera vier a precisar de uma, ela vai no projeto
da Itera; decida e documente antes, não replique o fluxo da DFL por reflexo.


## Learning DML boundary

The Learning Engine mutation boundary is `learning.apply_dml(text,jsonb)` in
`db/migrations/0082_learning_dml_rpc.sql`, extended by
`db/migrations/0087_learning_proposal_decisions.sql`. It uses the caller JWT and SECURITY INVOKER.
Proposal decisions require a learning operator, the complete proposal cluster, and human editorial instructions. They write zero evidence.
See `db/README.md` for its transaction, ownership, and duplicate-claim guarantees.
Migration PRs from #467 require full green CI under the 2026-09-07 authorization.

## Learning capability graph transition

Migration `0100_learning_capability_graph_endpoints.sql` adds nullable capability
endpoints beside the current concept endpoints. Endpoint XOR constraints keep
one physical target per side. The migration moves no graph row.

The two transition functions are SECURITY INVOKER. They require the complete
original row preimage. They derive all capability targets through the locked
`capabilities.concept_id` pointer. A caller must not supply a capability target.
Deploy dual-shape readers before any transition call. See `db/README.md` for the
exact JSON shapes, RLS rules, replay contract, and integration test.

The dual-shape relation import function also runs as SECURITY INVOKER. It keeps
legacy matches in place and derives only new physical targets. It serializes the
shared-edge batch and preserves the existing authenticated shared-edge policy.

## Learning C1 schema

C1 adds delivery, task expectation, and product tables through
`db/migrations/0084_learning_valued_work_artifacts.sql`. See `db/README.md` for the
shared-versus-owned reference rules and the proposed nullable-text autonomy target.
This schema change requires full green CI under the ITERA PR467+ authorization.

## Learning artifact cleanup

The generic artifact delete tool uses `learning.delete_artifact(uuid)` from
`db/migrations/0086_learning_artifact_cleanup.sql`. It accepts only the caller's
unreferenced artifact. It takes the 0083 learner lock before the artifact row
lock. See `db/README.md` for the refusal and concurrency contract.

The closed-set extractor commits through `learning.record_extraction_pass(jsonb)` in
`db/migrations/0085_learning_extraction_pass_atomic.sql`. Its caller-owned
`learning.extraction_passes` table is internal retry storage, not a capture-moment table.
See `db/README.md` for lock order, atomicity, and the local concurrency test.

## V2 session capture

`learning.ingest_episode_v2(jsonb,text,text)` in `db/migrations/0089_learning_v2_episode_ingest.sql`
commits the caller's explicit-root context, session, and captured moments together.
Exact retries return the original receipt; changed captures conflict. See `db/README.md`.

## Learning C2 decisions

Q17–Q19 (2026-09-07) defer learner role/constraints and PresentationModel.
LearnerModel maps to the existing `learning.learner_state`; no C2 migration is required.
The naming map and read-only catalog proof are in `db/README.md`.
Historical session regroup: see `db/README.md` and migration 0088 for the fixed cutoff,
manifest replay rules, and fail-fast writer lock protocol. Production reversal requires a new PR.


Residue re-pass uses `db/migrations/0091_learning_residue_repass.sql`. Its caller-owned immutable receipts derive matched/unmatched retry state. The operation reads residue sources; state refresh is separate.

<!-- Authorization probe: see db/README.md, Caller authorization probe (0092). -->

Historical digest extraction extends the receipt RPC through migration0090. Its deployed immutable T14 boundary is `2026-09-07T21:01:16Z`. See `db/README.md`.

Native evidence metadata expansion uses migration0093 after0091/0092. It retains JSON and existing writers, with exact key-presence reconstruction and a strict lossless audit. See `db/README.md` before any native writer conversion or JSON removal.

Native evidence writer bridge0094 follows0093. Its key-presence marker permits exact old/new INSERT compatibility while provenance stays present. See `db/README.md`; no metadata UPDATE grant or legacy drop is included.

Native SQL consumers0095 follow the0094 bridge. Atomic writers use native columns;
immutable request JSON and exact receipt validation remain. See `db/README.md` for
the populated legacy/native replay proof and the remaining D dependencies.

## Source-stamp CI preview ownership

The source-stamp CI job uses `scripts/run-source-stamp.mjs`. It builds once with
the existing stamp and stub flags. Vite binds an OS-assigned loopback port.
The launcher holds that server through all existing Playwright projects.
`STAMP_MANAGED_PREVIEW_URL` passes the actual bound URL to the config, which
skips its duplicate server startup. Local `npm run e2e:stamp` behavior stays
unchanged. The launcher closes the preview after success, failure, or handled
cancellation. Only its own child process group receives cancellation signals.
Hard process/host loss relies on normal OS socket cleanup.

`node --test scripts/tests/stamp-preview.test.mjs` tests concurrent real Vite
previews, positive fixture isolation, failed children, and owned cleanup.

Schema census version3 includes learning, enabled trigger state and column ACLs.
Use the actual merged migration series for its snapshot. The existing parity
suite includes real local drift mutations; see `db/README.md`.
The isolated0093 metadata prefix has its own named census expectation. Final-main
parity keeps its current-schema expectation; neither stage excludes learning.

A2 compatibility0097 reconstructs the exact0088 evidence projection from native
metadata. The read-only caller manifest verifier preserves original fingerprints.
The separate native reverse artifact retains all lock and dependency guards.
Physical provenance and ingest_batch_id remain. See `db/README.md`.


## Original ingest source compatibility

Migration0098 preserves the original nullable batch UUID in a typed source column.
Both fields must agree during coexistence. Current capture writers omit both.
The caller-only `export_work_episode_columns()` RPC returns exact typed metadata.
A2 projections preserve old fingerprint keys and hashes. No physical field is dropped.
See `db/README.md` for writer rules, local transition tests and the held release boundary.
Core contraction 0099 removes only physical evidence JSON and the two retired
checkpoint/config tables. Native fields, ingest_batch_id and legacy concepts stay.
The declared historical prefix and populated suffix each retain exact census and
replay checks. Production applier/db-apply stay unchanged. See `db/README.md`.
