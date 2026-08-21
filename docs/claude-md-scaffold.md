# Por que o CLAUDE.md deste repo não tem marcadores de scaffold

Extraído verbatim do `CLAUDE.md` em 2026-08-21 — o arquivo raiz ficou grande
demais e era reinjetado inteiro no contexto a cada compactação. Regra operativa
continua lá; o racional é este.

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
