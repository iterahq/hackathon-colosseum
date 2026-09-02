-- ============================================================================
-- Itera migration 0075 — o grandfather sai do CLIENTE e entra na view.
-- Applies to the ITERA Supabase project (kjefmwlopzeaqgqtlbdn) ONLY.
-- NOT dfl-schema. NOT DFL prod (yoojxnggaxcqtsyjdrdx). ADR-3 / ADR-26.
--
-- Continua a 0055, que declarou que existe UMA autoridade de entitlement e que
-- ela é o WHERE desta view. Duas isenções continuavam morando no cliente e
-- eram, na prática, gratuidade a pedido:
--
--   1. `isDflFederated` — `localStorage.itera_dfl_session === '1'`. Qualquer
--      pessoa com o devtools aberto digita essa linha e passa pelo paywall.
--      É REDUNDANTE desde a 0055: `POST /v1/embed/session` só matricula em
--      slug da allowlist `EMBED_ALLOWED_TENANT_SLUGS` (default `dfl-batch`), e
--      `dfl-batch` é `subscription_exempt`, então o fellow federado já recebe
--      uma linha `status='exempt'` por esta mesma view. O flag não entitula
--      ninguém que a view já não entitule — só entitula quem ela recusa.
--   2. Grandfather (D3) — conta criada antes de 2026-07-06 mantém acesso. O
--      cliente lia `session.user.created_at`, e o supabase-js persiste o objeto
--      `user` inteiro em localStorage: editar a data ali é editar o veredito.
--      Esta migration traz o mesmo recorte para cá, onde ele é um fato do
--      banco.
--
-- Comportamento preservado por construção: a mesma população que passava,
-- passa. O que muda é QUEM decide.
--
-- Ordem de deploy: esta migration PRIMEIRO, depois o player. Ela é aditiva ao
-- gate (só transforma redirect em acesso), então o cliente antigo — que ainda
-- carrega os dois bypasses — não quebra durante a janela.
--
-- ⚠️ Idempotente e OBRIGATORIAMENTE re-executável: `create or replace` +
-- `update` no-op sobre linha já verdadeira. Ver db/README.md.
-- ============================================================================

begin;

-- Reafirmado aqui, e não assumido da 0055, porque este arquivo é o que torna a
-- isenção do dfl-batch a ÚNICA porta da turma gratuita: ao remover o bypass do
-- cliente, uma linha `subscription_exempt = false` deixa de ser inofensiva e
-- passa a paywallar o Educar+ inteiro. Um `update` no-op é barato; descobrir
-- pelo aluno na aula não é.
update itera.tenants set subscription_exempt = true
  where slug = 'dfl-batch' and subscription_exempt is distinct from true;

-- Lista, ordem e tipos de coluna idênticos à definição viva (0055); só a
-- terceira UNION branch é nova. `create or replace` preserva os grants — um
-- `drop`/`create` derrubaria o select de `authenticated`/`anon` e paywallaria o
-- produto inteiro de uma vez. `security_invoker` continua OFF: a view lê
-- `billing.*` com direito de definidor e o WHERE é a fronteira de autorização.
create or replace view itera.my_subscription
with (security_invoker = false) as
  select
    s.tenant_id,
    s.status,
    s.seat_count,
    s.current_period_end,
    s.cancel_at_period_end,
    s.status = any (array['active', 'trialing']) as is_active
  from billing.subscriptions s
  where s.tenant_id in (
      select m.tenant_id from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
    )
    and s.status <> all (array['canceled', 'incomplete_expired'])

  union all

  -- Tenant que dá as aulas de graça (0055). O `plg-%` é a segunda tranca: um
  -- tenant pessoal marcado por engano seria conta gratuita vitalícia para todo
  -- signup self-serve, então a view se recusa a honrar a coluna sozinha.
  select
    t.id,
    'exempt'::text,
    null::integer,
    null::timestamptz,
    false,
    true
  from itera.tenants t
  where t.subscription_exempt
    and t.slug not like 'plg-%'
    and t.id in (
      select m.tenant_id from itera.memberships m
      where m.user_id = itera.current_itera_user_id()
    )

  union all

  -- Grandfather (D3): conta anterior ao paywall continua entrando.
  --
  -- Uma linha POR MEMBERSHIP, e não uma linha de usuário com `tenant_id` nulo,
  -- porque `tenant_id` é a chave que os leitores usam para rotular a linha —
  -- `itera-mcp:src/tools/subscription.ts` faz `.in('id', rows.map(r =>
  -- r.tenant_id))` direto. Um nulo ali não seria negado, seria uma query
  -- estranha. Quem não tem membership nenhuma também não tem nada atrás do
  -- gate: todo conteúdo é escopado por tenant.
  --
  -- `is_guest` fica de fora: a conta de convidado é minutada pela sala ao vivo,
  -- não é um usuário que "já existia". Vitalícia ela viraria a forma mais fácil
  -- de fabricar acesso.
  --
  -- A data é literal aqui de propósito. No cliente ela era
  -- `VITE_SUBSCRIPTION_GATE_DATE`, ou seja, configuração de BUILD decidindo
  -- entitlement — dois deploys do mesmo banco podiam discordar sobre quem paga.
  select
    m.tenant_id,
    'grandfathered'::text,
    null::integer,
    null::timestamptz,
    false,
    true
  from itera.memberships m
  join itera.users u on u.id = m.user_id
  where m.user_id = itera.current_itera_user_id()
    and not u.is_guest
    and u.created_at < timestamptz '2026-07-06 00:00:00+00';

comment on view itera.my_subscription is
  $$A ÚNICA autoridade de entitlement da Itera. Escopada ao chamador por
itera.current_itera_user_id(); o cliente lê esta view e não decide nada por
conta própria.

Devolve de zero a N linhas por chamador, uma por tenant, com is_active=true em
qualquer uma delas significando ENTITULADO:
  - status active/trialing  -> assinatura paga (billing.subscriptions)
  - status 'exempt'         -> membro de tenant com subscription_exempt (0055)
  - status 'grandfathered'  -> conta criada antes de 2026-07-06 (0075)

Quem lê deve procurar a linha entitulada (`rows.find(r => r.is_active)`), nunca
`limit 1`: um membro de tenant isento que TAMBÉM tem assinatura vencida
legitimamente produz duas linhas.$$;

commit;
