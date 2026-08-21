# Trace de aprendizagem — famílias, contexto pedagógico e abandono

Extraído verbatim do `CLAUDE.md` em 2026-08-21 (era o item "Kind novo de
activity" da seção Rules). O `CLAUDE.md` mantém o checklist operativo; aqui está
o racional inteiro — **por que** cada regra existe e o que cada uma já custou.

**Leia isto antes de mexer em trace, família, contexto pedagógico ou abandono.**
Várias das regras abaixo parecem bug para quem lê só o checklist: elas estão
escritas por extenso justamente para que o próximo agente não as desfaça.

- Kind novo de activity precisa de: entrada em `ActivityKind`
  (`src/types/content.ts`), view em `src/components/branded/activity/` (ou em
  `packages/activities/src/kinds/` se não depender de backend — nesse caso
  também uma fixture em `external-consumer/fixtures.json`, que o harness exige
  de toda kind anunciada),
  contrato em `src/stories/contractFixtures.ts` (o guard exige), story **e
  emissão de evento de tracking de aprendizagem** (plano
  [`20260731-itera-eventos-aprendizagem`](https://plans.devfellowship.com/20260731-itera-eventos-aprendizagem)).
  O motivo de a última entrar na lista é o mesmo motivo do plano existir: **não
  dá pra voltar no tempo e coletar o dado.** Um kind que shipa sem emitir não
  deixa buraco visível — deixa um período que ninguém consegue analisar depois.
  - **ONDE emitir: DENTRO de `persistActivityProgress`**
    (`src/services/progress.service.ts`). É o funil por onde toda tentativa
    liquidada passa — instrumentar ali cobre os kinds todos de uma vez, em vez
    de instrumentar atividade por atividade.
  - **NUNCA dentro do `ActivityRenderer`**, e a razão é de correção, não de
    gosto: `src/components/author/ActivityTestHarness.tsx` deliberadamente NÃO
    importa o `progress.service` — é essa fronteira que garante que o autor
    testando uma atividade não polui dado de aluno. Instrumentar no renderer
    quebraria a garantia em silêncio, e o harness continuaria "passando".
  - ⚠️ **Emita dentro da FUNÇÃO, não nos call-sites.** Eles já se moveram uma
    vez: hoje são `src/hooks/useAnswerOutbox.ts` (todo o ao-vivo mais os erros
    do self-paced, com fila durável para queda de rede) e
    `src/pages/LessonPlayer.tsx` (o acerto no self-paced, que bloqueia a UI com
    `saving`). Quem instrumentar por call-site perde a próxima reorganização.
  - **Kind novo herda a duração de graça** por estar nesse nível:
    `elapsed_ms` / `visible_ms` já são gravados em toda tentativa desde a
    migration `db/migrations/0033_activity_results_duration.sql`. O que os dois
    números significam (e por que média simples é a leitura errada) está em
    `src/utils/activityDuration.ts` — leia antes de consultar qualquer um deles.
  - **A FAMÍLIA vem primeiro — o kind novo escolhe uma, ou cria uma.**
    `src/utils/activityFamilies.ts` nomeia as cinco famílias de reducer
    (`selection` · `arrangement` · `reading` · `editor` · `scenario`, plano
    [`20260731-itera-padroes-reducer-atividades`](https://plans.devfellowship.com/20260731-itera-padroes-reducer-atividades),
    Fase A) e é **ela** que define o vocabulário de ação, não o
    `learningTrace.ts`. O `Record<ActivityKind, ActivityFamily>` é trap de
    exaustividade: kind sem família **não compila**.
    - **O critério pra saber se a família está certa:** *kind novo dentro de
      família existente tem que custar DADO + PREDICADO. Se custar máquina de
      estado nova, a fronteira da família está errada* — aí vale abrir família,
      não enfiar na que mais parece.
    - **Gravar ação:** `useActionRecorder(<família>, activity.id)`, e sobe pelo
      `onComplete(correct, { actions: trace.drain() })`. `record` é tipado por
      família — uma atividade de `selection` **não compila** emitindo
      `pair_made`. O buffer é `useRef` (zero re-render) e nada ali pode lançar:
      ele roda dentro do `onClick` do aluno.
    - **Nunca ponha texto livre no `payload`.** A resposta do aluno tem UM lugar
      (`activity_results.feedback.response`, com teto). O trace guarda O QUE ele
      tocou e QUANDO, nunca o que ele escreveu — duplicar significa dois lugares
      pra manter em dia e dois pra apagar.
      - ⚠️ **UMA exceção, autorizada e escopada: `command_run.command`** (o
        kind `terminal_sandbox`). Um comando de
        shell é texto livre pela letra da regra, e é gravado assim mesmo —
        **só na forma NORMALIZADA**, nunca a linha crua. Decisão do Tainan
        (question Q3 → B do plano
        [`20260806-itera-terminal-sandbox-activity`](https://plans.devfellowship.com/20260806-itera-terminal-sandbox-activity)),
        e ela está escrita aqui **porque sem isso o próximo agente lê a regra
        acima e desfaz achando que é bug.**
        - **Por quê:** é o único dado que separa erro de verdade de matcher
          rígido demais. Sem ele, o aluno que digitou uma variante legítima que
          o autor esqueceu de listar aparece como erro comum, indistinguível de
          quem não sabe o comando — a atividade fica "quebrada" pra ele e "ok"
          pra gente.
        - **A leitura que mantém a regra coerente:** comando de terminal é
          **vocabulário de ferramenta**, mesma categoria do valor autorado de
          `slot_set`, e não a prosa do aluno. Um terminal não tem "texto de
          resposta" — a resposta dele É quais comandos rodou.
        - Enumerada como dado em `FREE_TEXT_PAYLOAD_CARVE_OUTS`
          (`src/utils/activityFamilies.ts`), pra auditoria não depender de grep
          em comentário. `PAYLOADS_CARRY_NO_FREE_TEXT` continua `true`: ele rege
          todo o resto.
    - **`FAMILY_EMITTED` é ledger, não meta.** Ele lista o que este build
      realmente emite (hoje: `selection`, `arrangement` e `scenario`). Declarar
      sem emitir faz toda query downstream ler trace de duas ações como se fosse
      sequência completa — `src/test/activityFamilies.test.ts` e
      `src/test/activityTraceEmission.test.tsx` travam os dois lados.
      - ⚠️ **`scenario` é PARCIALMENTE ligada:** `terminal_sandbox` emite
        (`command_run`, `sandbox_reset`); `chat_sandbox` ainda não. Quem consulta
        `activity_traces` da família `scenario` **tem que filtrar por `kind`**,
        não supor uniformidade — é por isso que `familyEmitsSequence()`
        (`src/utils/replaySession.ts`) responde por KIND e não por família:
        responder pela família viraria toda linha de chat de "esse kind ainda
        não emite" (verdade, e explicado na tela) para "o aluno não fez nada"
        (mentira, e sem explicação).
  - **O cano já existe — use, não reinvente.** O contrato versionado está em
    `src/utils/learningTrace.ts` e a linha vai pra `itera.activity_traces`
    (migration `db/migrations/0034_activity_traces.sql`), **uma linha por
    tentativa** com o array de ações em `jsonb`. Ação nova é acréscimo: novo
    `type`, nova chave de `payload`, **sem** bump de `schema_version` e **sem**
    migration. Leia a regra de quando a versão sobe no topo daquele módulo antes
    de mexer no formato.
  - **A linha também carrega CONTEXTO PEDAGÓGICO** —
    `src/utils/pedagogicalContext.ts` → `itera.activity_traces.pedagogical_context`
    (migration `db/migrations/0038_activity_traces_pedagogical_context.sql`,
    Fase 1 do plano
    [`20260803-itera-learning-control-plane-prototipo`](https://plans.devfellowship.com/20260803-itera-learning-control-plane-prototipo)).
    Guarda o que a atividade EXERCITAVA (`template`, `family`,
    `mental_structures[]`, `metaphor`, `difficulty`, `objective`) **no instante
    da tentativa**, não por join na análise — a gramática é viva por decisão
    (ADR-5), então um join re-etiquetaria a história toda vez que ela mudasse.
    - **O autor escreve em `itera.activities.spec.pedagogy`.** Toda chave que
      este build não reconhece sobrevive verbatim em `extra`, de propósito: é o
      que faz mudança de gramática virar job de reprocessamento em vez de
      migração de cliente (ADR-2).
    - **Não filtre vocabulário no cliente nem no banco.** `GRAMMAR_V0_*` e
      `unknownGrammarTerms()` servem pra SINALIZAR deriva (lint de manifesto),
      nunca pra descartar termo — descartar tornaria invisível a primeira
      tentativa de uma estrutura nova.
    - **Leitura:** `flattenTraceEvents()` (em `learningTrace.ts`) devolve UM
      registro por evento já com o contexto anexado. O contexto é gravado uma
      vez por linha; quem denormaliza é o leitor.
  - **⚠️ A TABELA TEM DUAS ESPÉCIES DE LINHA DESDE A 0040 — leia antes de
    escrever qualquer query.** Além da tentativa liquidada, ela agora guarda a
    **TENTATIVA ABANDONADA**: a atividade que o aluno abriu, olhou e largou sem
    responder (`itera.activity_traces.outcome`, migration
    `db/migrations/0040_activity_traces_outcome.sql`, Fase 1 do mesmo plano).
    Antes disso um abandono não produzia linha em lugar NENHUM — nem em
    `activity_results`, nem em `progress`, nem aqui — e era exatamente o sinal
    de desistência que a Fase 4 quer.
    - **Os dois predicados portáteis**, que funcionam em toda linha já escrita:
      liquidadas → `where outcome is distinct from 'abandoned'`; abandonos →
      `where outcome = 'abandoned'`. **Nunca** `where outcome = 'settled'` numa
      população histórica: isso exclui em silêncio tudo o que foi escrito antes
      da migration, onde a coluna é NULL. NULL aqui é *"não capturado"*, não
      *"liquidada"*.
    - **A regra do que conta** está em `src/utils/abandonment.ts` (pura) e o
      disparo em `src/hooks/useAbandonmentBeacon.ts`: renderizou, ficou pelo
      menos `MIN_ABANDONMENT_VISIBLE_MS` de tempo VISÍVEL, não liquidou, e a
      superfície sumiu (desmontou ou `pagehide`). O filtro **subconta de
      propósito** — abandono não registrado é lacuna; abandono inventado é
      afirmação falsa sobre um aluno.
    - **⚠️ Uma linha abandonada NÃO é prova de que o aluno achou difícil.** É
      prova de que ele saiu. Compare TAXAS entre atividades irmãs; não leia a
      linha isolada.
    - **Um abandono NÃO escreve `activity_results` nem `progress`.** Gravar
      `passed: false` contaria não-tentativa como erro e faria toda métrica de
      acerto mentir — o defeito D2 pelo avesso. Por isso ele tem função própria
      (`persistActivityAbandonment`) em vez de uma flag no
      `persistActivityProgress`: assim a escrita errada é *inalcançável*, não
      só improvável.
    - **A escada de degradação (`traceWriteRungs`) tem UM degrau que não
      existe:** `outcome` pode ser largado numa linha LIQUIDADA (NULL ainda se
      lê como liquidada) e **nunca** numa ABANDONADA — sem ele a linha se leria
      como tentativa respondida. Enquanto a coluna não existir no schema no ar,
      o abandono **não é escrito** e espera na fila durável. Menos dado, nunca
      dado falso. (Desde 2026-08-04 o merge aplica a migration — `db-apply` —
      mas deploy e apply correm em paralelo, então a janela é de minutos, não
      zero.)
    - **Entrega no teardown = fila durável, não `sendBeacon`.** `sendBeacon` não
      seta headers e todo write vai pro PostgREST autenticado; um beacon só
      alcançaria um endpoint anônimo, que este repo não tem. `localStorage` é
      síncrono e sobrevive ao `pagehide`; o dreno seguinte escreve. O que ainda
      se perde está listado no cabeçalho de `src/hooks/useAbandonmentBeacon.ts`.
    - **Superfície: só o `LessonPlayer` (self-paced) hoje.** No ao vivo a
      ausência de resposta já é recuperável por query (`class_attendance` sem
      `class_answers`), então não é dado perdido para sempre — que é o critério
      de ordenação desta fase. E o force-advance do professor tirando a
      atividade da tela **não é** o aluno saindo; conflatar os dois tornaria a
      taxa ininterpretável.
  - **Precisa de coluna/tabela nova para o evento?** Só se o acréscimo acima não
    resolver. Migration em `db/migrations/`, **idempotente**; o merge para `main`
    aplica — ver *Contracts → Schema* acima e [`db/README.md`](db/README.md).
    Nunca `devfellowship/dfl-schema`: aquele é o banco da DFL, outro projeto.
  - **O que já TRAVA hoje, e o que ainda NÃO trava** — esta regra vale pelo que
    a CI barra, não pela boa intenção:
    - ✅ **Já trava (typecheck):** `src/types/content.ts` **re-exporta**
      `ActivityKind` de `@iterahq/activity-spec`, então um kind novo no pacote
      deixa o `Record<ActivityKind, …>` de `src/utils/activitySpecBoundary.ts`
      incompleto e quebra `npm run typecheck` — que é passo próprio da CI
      justamente porque `vite build` transpila sem checar tipos (PR #195).
    - ✅ **Já trava (testes):** kind sem contrato/cobertura quebra
      `src/test/activityContractFixtures.test.ts` e
      `src/test/activityKindValidationCoverage.test.tsx`.
    - ✅ **Já trava (campo obrigatório):** `passed`, `duration` e `settledAt`
      NÃO têm default em `persistActivityProgress`, de propósito — um call-site
      novo tem que declarar o que aconteceu, ou não compila. *"Um flag
      omitido-por-default é o bug"* já custou caro aqui (o log de tentativas só
      guardava acerto). **É esse o mecanismo que o checker de tracking vai
      reusar.**
    - ✅ **Já trava (fronteira de emissão):** `src/test/traceEmissionBoundary.test.ts`
      falha se qualquer arquivo da árvore de atividades importar
      `@/services/progress.service` ou `@/utils/learningTrace`, ou se algum
      módulo além do `progress.service` escrever em `activity_traces`. **É por
      isso que `RecordedAction` mora no `activityFamilies.ts` e não no
      `learningTrace.ts`** — a atividade precisa nomear o tipo que produz sem
      enxergar o envelope nem o escritor. O mesmo teste também trava o recorder
      e o registro de famílias como PUROS (sem Supabase, sem outbox, sem React).
      Ou seja: o **ONDE** das regras acima é gate; o **SE** ainda não é.
    - ✅ **Já trava (família):** kind sem entrada em `ACTIVITY_FAMILY` não
      compila, e `src/test/activityFamilies.test.ts` cruza o mapa com o
      `ACTIVITY_KINDS` do pacote nas DUAS direções (chave órfã também falha).
    - 🔴 **AINDA NÃO trava:** **não existe** checker que exija que um kind novo
      EMITA evento de tracking — é a **Fase 5** do plano acima. Até lá, **este**
      item é regra escrita, não trava: não conte com a CI para pegá-lo, e não
      descreva em PR como se ela pegasse. (O cano em si — Fases 2-4 — **já
      existe**; era só ele que faltava quando esta linha foi escrita.)
      ⚠️ **A lista canônica de kinds, que esta linha dizia não existir, EXISTE.**
      Ela é a do PACOTE, e ela é MENOR que o enum: `ACTIVITY_KINDS` de
      `@iterahq/activity-spec@1.0.0` tem **13**, igual ao `switch` do
      `ActivityRenderer`, contra os **14** do enum derivado de `db/migrations/`
      (conferido no `pg_enum` ao vivo e em `db/census/expected-schema.txt`). A
      diferença é só o `sandbox_scenario` aposentado, e ela é permanente — o
      Postgres não deixa tirar valor de enum. Quem construir a Fase 5 parte da
      lista do pacote, não do enum, e não de uma terceira.
      `BUILT_IN_ACTIVITY_KINDS` tem **12**: `code` sai pelo segundo entrypoint
      (ADR-5).
