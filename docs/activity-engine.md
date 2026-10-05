# O engine de activity — fronteiras, camadas puras e o pacote

Extraído verbatim do `CLAUDE.md` em 2026-08-21. É o racional das fronteiras do
engine: o que saiu para `@iterahq/activities` e o que ficou no app, as camadas
puras, a validação fail-closed de spec, as fixtures de contrato e os dois gates
de CI que a borda do workspace não prova.

**Leia isto antes de mexer no engine.** Cada fronteira descrita aqui tem um teste
que trava — quebrou, é regressão, não é ruído.

⚠️ **Desde a Fase C (2026-08-07), DEZ kinds NÃO moram mais aqui.** `concept`,
`concept_reveal`, `video`, `single_choice`, `multi_choice`, `match`, `order`
(passos 1–3), **`chat_sandbox` e `terminal_sandbox`** (passo 4) e **`code`**
(passo 5) foram
extraídos para `@iterahq/activities`, junto com os primitivos
(`InstructionPanel`, `RichText*`, `parts`, `AnswerExplanation`,
`ActivityTextarea`) e a lógica pura (`answerMachine`, shuffle, parser de
markdown-leve, `terminalSuccessMarks`). Os arquivos antigos continuam existindo
como **re-export de uma linha**, então todo import por
`@/components/branded/activity/<Kind>` segue valendo — mas **editar o arquivo
aqui não muda nada**: a implementação está no pacote.

Os dois kinds de sandbox levaram junto as pastas **`sandbox/` e `terminal/`
inteiras**
— hoje em `packages/activities/src/kinds/sandbox/` e `.../kinds/terminal/`. Só
ficaram no app os pontos que o app precisa: `sandbox-live/` (o gêmeo julgado por
IA, que consome `api.respond`/`api.judge`), `byoc/`, `JudgeHeatmap` e
`document`/`diagram`/`quiz` (ainda inline no dispatcher).

📦 **O `code` mora num SEGUNDO entrypoint: `@iterahq/activities/code`** (ADR-5).
Ele não está em `BUILT_IN_ACTIVITY_KINDS` de propósito — o bundle base responde
"não, pergunta ao host" para `code`, e quem quer o kind importa `/code` e o
registra em `ActivityHostContext.renderers`. Foram junto `useCodeSnack`,
`useCodeChecks`, `transpileSnack`, o documento do iframe de preview e o runtime
de correção (`packages/activities/src/code/`); os caminhos antigos em
`src/hooks/`, `src/utils/`, `src/consts/` e `src/components/branded/activity/code/`
são re-export de uma linha. `scripts/assert-entrypoint-isolation.mjs` percorre o
grafo de módulos do `dist/` e falha se o entrypoint base alcançar qualquer coisa
de `code/` — roda no `npm test` e de novo dentro do `external-consumer/check.sh`.

⌨️ **O Monaco NÃO foi para o pacote, e isso é a decisão do passo 5.**
`src/components/editor/CodeEditor.tsx` continua no app porque ele carrega duas
coisas que são da Itera e não de qualquer consumidor: o CustomEvent de caret que
a aula ao vivo espelha no telão, e a configuração do worker de TypeScript escrita
contra o Monaco self-hosted deste repo. O pacote recebe o editor pela MESMA porta
que recebe i18n e auth — `<ActivityProvider codeEditor={…}>` — e, sem injeção,
desenha um `<textarea>` funcional (sem highlight). `IteraActivityHost` injeta o
`CodeEditor` do app.

💾 **O rascunho do `code` também virou porta.** `useCodeSnack` não chama mais
`@/services/codeSnapshot.service`: escreve por `ActivityStoragePort`, e
`ITERA_ACTIVITY_STORAGE` (em `IteraActivityHost.tsx`) traduz de volta — mesma
chave por aluno, mesmo envelope `{code, savedAt}`, mesmo `CODE_SNAPSHOT_EVENT`.
`src/test/codeDraftKeyCompat.test.tsx` trava isso: se a chave mudar, todo
rascunho no disco de uma sala vira inalcançável **em silêncio**.

🌍 **Uma activity dentro do pacote lê i18n do `<ActivityProvider>`, NÃO do
`@/i18n`.** Uma árvore com `I18nProvider` e sem `ActivityProvider` cai no
dicionário do próprio pacote, que é idêntico ao do app mas **fixo em `pt`** —
então um teste/story sensível a idioma monta `ActivityI18nBridge` (ou
`IteraActivityHost`). Sem isso ele compara português com português e passa por
engano; foi exatamente o que aconteceu com `terminalRenderedLocale.test.tsx` no
passo 4.

## `sandbox_scenario` — deprecado, não retirado

⚠️ **`sandbox_scenario` está DEPRECADO, não retirado.** Medido no banco da Itera
em 2026-08-13: o valor está vivo no enum e **zero linhas** o carregam — nem em
`itera.activities` nem em `itera.activity_defs`. As 48 linhas (29 + 19) foram
relabeladas para `chat_sandbox` por DML em 2026-08-10. O valor **não sai do
enum**: o Postgres não tem `ALTER TYPE … DROP VALUE`, então removê-lo exigiria
recriar o tipo e reescrever toda coluna que o usa. A remoção no nível do pacote e
do app já entrou (`activity-spec` 1.0.0, PR `iterahq/itera-player#353`, **sem
migration nenhuma**): o app renderiza **13** e o valor sobrevive só no enum. Uma
linha nova com esse kind — semeada à mão ou por consumidor velho — cai no
`UnknownActivity` (`data-activity-kind="unknown"`), não numa tela em branco.

### Camadas puras (teste barato, sem React)

- **`src/utils/answerMachine.ts`** — `answerMachine(input) → viewState`
  (`shown`, `locked`, `canSubmit`, `gradeResult`) + `choiceOptionState()`.
  Consumida por `SingleChoice`, `MultiChoice`, `Match`, `Order`, o `Quiz`
  inline do `ActivityRenderer` e `byoc/ByocTree`. **Não reintroduza a lógica
  derivada inline nos componentes** — foi deduplicada de propósito.
- **`src/utils/liveActivityGate.ts`** — `learnerActivityGate({timerRunning,
  expired, answered})` → `{started, locked, readOnly, canComplete}`. Única
  fonte de verdade de quando o aluno pode responder ao vivo.
- **`@iterahq/activity-spec/runtime`** — reducers puros dos **dois** kinds de
  sandbox. Os hooks (`useSandboxScenario` pro chat, `useTerminalSandbox` pro
  terminal) só ligam reducer a `useState`; todo julgamento é do runtime.
  - **São DOIS kinds desde 2026-08-12**, `chat_sandbox` e `terminal_sandbox`,
    despachados pelo `kind` da linha no `ActivityRenderer`. Antes eram um kind
    só (`sandbox_scenario`) com um discriminador `spec.sandboxKind` dentro do
    componente. ⚠️ O enum do banco **ainda aceita** `sandbox_scenario`: o
    passo (3) do plano da migration `0057` — recriar o tipo sem ele — é
    migration própria e só depois deste app estar no ar. Nenhuma linha o
    carrega (medido em 2026-08-12, zero em `activities` e `activity_defs`) e
    este build não renderiza mais o valor.
    - `chat_sandbox` → `ChatModel`, variantes por forma do spec
      (`slots` / `choices` / nenhum);
    - `terminal_sandbox` → `TerminalModel`, variantes por `spec.inputMode`
      (`freeText` / `options`), em
      `src/components/branded/activity/terminal/`. Engines resolvidos por
      NOME (`initialState.engine`), default `none` = terminal genérico com
      saída 100% autorada. Plano
      [`20260806-itera-terminal-sandbox-activity`](https://plans.devfellowship.com/20260806-itera-terminal-sandbox-activity).
  - ⚠️ **O terminal NÃO usa `answerMachine`, de propósito** (ADR-7 do mesmo
    plano) — e o sandbox de chat também não. `answerMachine` modela *uma
    resposta, um submit, um veredito*; um terminal é N turnos contra um modelo
    de mundo com progressão derivada de predicado. A regra que continua valendo
    é a de baixo: nada de lógica derivada de correção **inline no componente** —
    ela mora no `runtime/` do pacote.

### Validação de spec

**Fail-closed em TODOS os kinds desde 2026-07-28** (ADR-15 do plano
`20260728-itera-activity-testing`; supersede o ADR-13, que dava essa fronteira
ao plano irmão de back-office). Antes, `safeParseActivitySpec(kind, spec)` (do
`@iterahq/activity-spec`, hoje resolvido do GitHub Packages privado) era
chamado só em **`code`** e nos
dois sandboxes e os outros 9 kinds recebiam o `spec` por cast.

- **Onde:** `src/utils/activitySpecBoundary.ts` (registro + veredito + auditor) e
  o `ActivityRenderer`, que valida antes do switch de kind. `code`,
  `chat_sandbox` e `terminal_sandbox` seguem validando dentro do próprio componente
  (`site: 'component'`), com os testids históricos `code-invalid` /
  `sandbox-invalid`. Card único: `InvalidSpecCard` (`data-invalid-spec="true"`).
- **Kind novo sem cobertura = CI vermelho**, por dois caminhos: o
  `Record<ActivityKind, …>` do registro (erro de `npm run typecheck`, que é gate
  de build) e `src/test/activityKindValidationCoverage.test.tsx`. A cláusula
  `satisfies` interna do pacote NÃO ajuda aqui — o pacote é instalado
  pré-compilado (`dist/`), então aquela cláusula nunca recompila nesta CI.
- **BYOC é camada, não kind** — duas isenções deliberadas: o harness
  (`resolveByocSpec`, roda antes da fronteira) e o BYOC ao vivo (`isByocLive`,
  contrato sem Zod porque a resposta vem de LLM real). Validar os sandboxes
  em bloco quebraria o caminho ao vivo.
- **Lacuna declarada:** `document`, `diagram` e `quiz` têm schema **stub loose**
  (`z.record`) no pacote — `safeParseActivitySpec('quiz', {})` PASSA. Ali
  "validado" só quer dizer "é um objeto JSON". Apertar isso é mudança no repo
  `iterahq/activity-spec` (bump + republish + bump do range aqui), não aqui.

### Fixtures — uma fonte de verdade

`src/stories/contractFixtures.ts` é o registry de contratos por kind, e
`src/test/activityContractFixtures.test.ts` já é um guard: **todo kind do enum
precisa de contrato, e todo contrato precisa passar no Zod do seu kind**. Kind
novo sem fixture = CI vermelho. Use as MESMAS fixtures nas stories e nos
testes — não crie um segundo conjunto.

### Contrato público do `@iterahq/activities`

As activities são um pacote instalável (plano
`20260803-itera-player-activities-lib`). **Fases A, B e C (passos 1–5) estão
feitas** — os renderers sem backend já renderizam fora do Player, e o `code` sai
por um segundo entrypoint. Falta de C: a metade julgada por IA do passo 4
(`sandbox-live`, BYOC, `JudgeHeatmap`) e os três kinds ainda inline no
dispatcher.

Este repo é um **monorepo de npm workspaces** (ADR-2 — workspaces puro, NÃO
Turborepo). O app fica na raiz; os pacotes publicáveis ficam em `packages/*`:

- `packages/activities/` → **`@iterahq/activities`**, com DOIS entrypoints: o
  base (API pública + renderers sem backend) e **`@iterahq/activities/code`**
  (o kind pesado, ADR-5 — nunca no bundle base). O que ficou de fora e por quê
  está na tabela do [`README`](packages/activities/README.md). Racional, ordem
  de extração e cobertura por kind:
  [`packages/activities/CONTRACT.md`](packages/activities/CONTRACT.md). Setup de
  consumidor (`.npmrc` + token):
  [`packages/activities/README.md`](packages/activities/README.md).

O app consome o pacote pelo nome — `import { … } from '@iterahq/activities'` —
e não por caminho relativo, resolvendo pelo **`dist/`** do workspace. É a MESMA
borda que um host externo usa, então ela fica exercitada em vez de só declarada.
Editar `packages/activities/src/` só surte efeito depois de rebuild; por isso
`predev`, `pretest`, `pretypecheck` e `prebuild` rodam `npm run build:packages`.

Duas coisas que a borda do workspace NÃO prova, e que têm gate próprio na CI:

- **portabilidade real** → `external-consumer/` empacota o pacote com
  `npm pack`, instala o **tarball** num projeto separado (sem bundler, sem TS,
  sem nada da Itera) e renderiza toda kind anunciada a partir de specs de fixture,
  com `fetch` armado pra estourar. `npm run external-consumer`;
- **estilo** → as classes Tailwind dos renderers extraídos vivem fora de
  `./src`, então `src/index.css` precisa do `@source '../packages/*/dist/**/*.js'`.
  Sem ele o build fica **verde e sem estilo**; o job `build-test` assere no CSS
  gerado.

O adapter do app é `src/components/branded/activity/IteraActivityHost.tsx`,
montado no `App.tsx`: ele injeta `i18n` e `identity` (⚠️ `identity.userId` é o
seed do shuffle por aluno — se sumir, nada quebra e a propriedade pedagógica
some em silêncio).

**Registry: GitHub Packages, privado** (ADR-6 preservado, registry trocado em
2026-08-04 — a org npm `iterahq` está no plano free e free só publica pacote
PÚBLICO, o que o ADR-6 veta). Publicação: `.github/workflows/release-activities.yml`.

Ao mexer em qualquer renderer, respeite a fronteira: o que a activity precisa do
host entra por PORTA injetada (`i18n` · `api` · `identity` · `theme` ·
`storage`), não por import direto de `@/api/*`, `@/auth/*` ou `@/services/*`.
O guard `src/test/activityPublicContract.test.ts` fica vermelho se um renderer
crescer uma prop fora do contrato.
