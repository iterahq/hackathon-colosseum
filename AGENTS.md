# AGENTS.md — itera-player

> **Este arquivo é REPO-OWNED.** Até 2026-07-31 ele carregava um bloco
> `<!-- BEGIN GENERATED:agents/base -->` com `render-meta: repo=dfl-iterate`,
> herdado do scaffold gerenciado de `devfellowship/dfl-iterate` (o commit de
> fundação deste repo foi um re-skin daquele projeto). O bloco se anunciava como
> conteúdo gerenciado, mas **nada nunca o regenerou aqui** — e ele mandava o
> agente pro repo errado na hora mais perigosa: mexer em schema.
>
> Removido pelo mesmo motivo e com a mesma evidência que levaram o `CLAUDE.md` a
> perder o dele em 2026-07-28: o `registry/distribution-manifest.yaml` do
> `dfl-hq` só conhece `devfellowship/dfl-iterate`, e o pipeline inteiro está em
> `execution_mode: stage-only` com `apply_writes_enabled: false` —
> `dfl-hq:scripts/context/apply.mjs` aborta antes de escrever em qualquer repo
> filho. `iterahq/itera-player` não aparece em lugar nenhum daquele registry.
> Editar este arquivo aqui é seguro e persiste.
>
> Se um dia alguém ligar a distribuição para cá, a ausência de marcadores é o
> comportamento seguro: o merge é `marker-required` com
> `missing_markers: hard-stop` — falha alto em vez de sobrescrever isto em
> silêncio.

Leia isto antes de tocar em qualquer coisa. O detalhe de arquitetura, engine de
activity e convenções está no [`CLAUDE.md`](CLAUDE.md); o contrato legível por
máquina, no [`repo-contract.yaml`](repo-contract.yaml).

## Operating Principles

1. **Explore antes de agir** — leia `CLAUDE.md` e `repo-contract.yaml` primeiro.
2. **Commits atômicos** — uma mudança lógica por commit: `feat:`, `fix:`,
   `refactor:`, `docs:`.
3. **Teste o que você mudou** — `npm run lint` + `npm run typecheck` +
   `npm run build` + `npm test` têm que passar. O `typecheck` é gate de build.
4. **Mudou contrato? Atualize a doc** — `CLAUDE.md` e `repo-contract.yaml` andam
   junto com o código, e `scripts/verify-docs.sh` roda na CI (job `docs-drift`)
   justamente pra impedir que eles se separem de novo.
5. **Deixe rastro** — decisão não-óbvia ganha comentário explicando o PORQUÊ.
6. **Valide fronteiras** — confira o `repo-contract.yaml` antes de adicionar
   dependência cross-repo.
7. **Solução mais simples que funciona.** Legível > esperto.

## 🚨 Schema / banco — a Itera é DONA do próprio banco

**Esta é a regra que o scaffold antigo errava, e o erro era perigoso.** A versão
anterior deste arquivo dizia *"ALL schema changes go through `dfl-schema` — never
write migrations here"*. **Isso é falso para a Itera** e contradiz diretamente o
[`db/README.md`](db/README.md), que é a fonte canônica.

- A Itera tem **projeto Supabase próprio** — `kjefmwlopzeaqgqtlbdn` (ADR-3 /
  ADR-26), **independente do `dfl-schema`**.
- **O schema mora NESTE repo**, em `db/migrations/` (schema-in-monorepo, ADR-F1).
  Migration nova é um arquivo novo ali, com prefixo numérico sequencial de quatro
  dígitos seguindo o último — **não** um PR em `devfellowship/dfl-schema`.
- **NUNCA** aponte para a DFL prod `yoojxnggaxcqtsyjdrdx`. Aquele banco é de
  outro projeto, e é ele — não este — que exige o fluxo de PR do `dfl-schema`.
- **Mergear para `main` APLICA a migration** (workflow `db-apply`, desde
  2026-08-04). O merge humano é o gate; a CI é quem roda
  `db/scripts/apply-migrations.sh`. Até essa data era à mão, e o resultado foi
  0036/0037/0038 mergeadas e **não** aplicadas por dias — tentativas gravadas
  naquele intervalo perderam `spec_snapshot`, `spec_locale` e
  `pedagogical_context` para sempre.
- Existe **ledger** (`itera.schema_migrations`, chave = nome do arquivo): cada
  arquivo aplica **uma vez só**, com checksum. Editar uma migration já aplicada
  faz o apply **falhar** em vez de pular em silêncio.
- **Toda migration continua tendo que ser idempotente** (`IF NOT EXISTS`,
  `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`,
  `ADD VALUE IF NOT EXISTS`, seed com `ON CONFLICT DO NOTHING`). O ledger protege
  contra re-aplicação **conhecida**; idempotência protege contra a
  **desconhecida** — restore de backup, ambiente novo, arquivo
  `-- itera:no-transaction` que morreu entre o DDL e o registro. São duas camadas
  e manter as duas custa perto de zero.
- Um job diário (`db-drift`) abre uma **issue** se algo mergeou e não aplicou, se
  um arquivo aplicado foi editado, ou se o banco ganhou objetos que nenhuma
  migration explica.

Leia o [`db/README.md`](db/README.md) inteiro antes da primeira migration — ele
cobre RLS, o pooler correto (`aws-1`, **não** `aws-0`) e o que sobra de um run
que falha no meio.

## Edge Functions

Este repo **não tem** `supabase/functions/`, e as edge functions da DFL (que
vivem no `dfl-schema`) não têm nada a ver com a Itera. Se a Itera vier a precisar
de uma, ela vai no projeto Supabase da Itera — decida e documente antes, não
replique o fluxo da DFL por reflexo.

## Forbidden Actions

1. Nada de mudar variável de ambiente de produção.
2. Nada de segredo no código — credenciais vêm do Infisical (`/apps/itera`).
3. Nada de escrever direto na DFL prod `yoojxnggaxcqtsyjdrdx`.
4. Nada de editar `src/components/ui/` à mão — shadcn/ui gerenciado.
5. Nada de dependência cross-repo não documentada no `repo-contract.yaml`.
6. Nada de apagar seed sem migration.
7. Toda env var nova entra no `repo-contract.yaml` **e** no `.env.example`.

## Story/Component ownership

Duas áreas distintas de stories do Storybook — siga a divisão, ela é imposta
pelo `.github/CODEOWNERS`:

- **`design-playground/`** (raiz do repo) — espaço de brainstorm do designer.
  **johnoak (designer) sempre publica as mudanças dele AQUI**, livre pra
  experimentar sem gate de review. É descoberto por um glob próprio no
  `.storybook/main.ts`, separado do glob canônico `src/**`.
- **`src/stories/` + `src/components/`** — stories e componentes **canônicos**.
  **Só desenvolvedores (`@taigfs` e `@SamuelStefano`) atualizam.** Se você está
  agindo em nome do designer, não escreva nesses paths — roteie a mudança por um
  desenvolvedor.
- Agentes: ao mover/adaptar uma story do design-playground pro conjunto
  canônico, faça como PR revisada normal (um desenvolvedor mergeia) — **nunca**
  alargue o CODEOWNERS do `design-playground/` pra cobrir path canônico, e nunca
  remova as entradas canônicas pra "destravar" uma mudança do designer.

## When Stuck

1. Releia o `CLAUDE.md`.
2. Confira o `repo-contract.yaml` e o `db/README.md`.
3. Diga claramente que travou — não chute e suba.
