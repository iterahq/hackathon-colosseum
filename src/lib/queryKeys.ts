/**
 * Factory central de query keys do React Query.
 *
 * Por que existir:
 * - Evita chave string solta espalhada pelo código.
 * - Permite invalidar grupos inteiros (ex.: `queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all })`).
 * - Ajuda autocomplete a guiar quem está escrevendo um hook novo.
 *
 * Convenção:
 * - `all` é a chave-raiz daquele recurso (sem parâmetro).
 * - Funções recebem parâmetros e retornam tuplas `as const` para o TS narrar bem.
 */
/**
 * 🌐 LOCALE IS PART OF EVERY CONTENT KEY.
 *
 * Authored activity content is bilingual jsonb (`{ pt, en }` bags) that the
 * service layer collapses to plain strings while mapping the row
 * (`resolveLocalizedSpec` in programs.service / authorCanvas.service). That
 * collapse is LOSSY and happens inside the `queryFn`, so the cached value is
 * language-specific: a `['lesson', id]` entry populated while the locale was `pt`
 * holds Portuguese strings, and nothing about a later locale change can turn it
 * back into English.
 *
 * That bit an English learner in two ways before locale joined these keys:
 *   1. Toggling the language left every already-loaded activity in Portuguese.
 *   2. On a cold load the lesson query often resolved BEFORE `useLocaleSync`
 *      hydrated `itera.users.locale`, so the cache was filled at the default `pt`
 *      and the subsequent switch to `en` changed nothing.
 *
 * Keying by locale makes each language its own cache entry, so both cases
 * re-run the mapping. Any NEW key whose payload carries authored content must
 * take a `locale` too.
 */
export const queryKeys = {
  lessons: {
    all: ['lessons'] as const,
    byId: (id: string) => ['lessons', id] as const,
  },
  activities: {
    byLesson: (lessonId: string) => ['activities', { lessonId }] as const,
  },
  // Canonical Itera content (real Supabase `itera.*`).
  programs: {
    all: ['programs'] as const,
    bySlug: (slug: string, locale: string) => ['programs', slug, { locale }] as const,
  },
  // Self-serve catalog (membership-independent, via SECURITY DEFINER RPC).
  catalog: {
    all: ['catalog'] as const,
  },
  lesson: {
    byId: (id: string, locale: string) => ['lesson', id, { locale }] as const,
    next: (id: string) => ['lesson', id, 'next'] as const,
    /**
     * Guest content comes from itera-api, not PostgREST, and is scoped to the
     * invited session — so it gets its OWN key. Sharing `byId` would let a cached
     * member read satisfy a guest (and vice-versa) across a logout on the same
     * browser.
     */
    byGuestCode: (code: string, locale: string) => ['lesson', 'guest', code, { locale }] as const,
  },
  user: {
    stats: ['user', 'stats'] as const,
    badges: ['user', 'badges'] as const,
  },
  // Self-profile (itera.users own row). Root 'profile' matches the historical
  // inline key so invalidateQueries({ queryKey: ['profile'] }) keeps working.
  profile: {
    all: ['profile'] as const,
    mine: (userId: string) => ['profile', userId] as const,
  },
  // Tenant-admin observability surface (plan #6). Scoped by tenantId.
  admin: {
    roster: (tenantId: string) => ['admin', 'roster', tenantId] as const,
    completion: (tenantId: string) => ['admin', 'completion', tenantId] as const,
    engagement: (tenantId: string) => ['admin', 'engagement', tenantId] as const,
  },
  // PLG subscription entitlement (gating). Scoped by the auth user id.
  entitlement: {
    mine: (userId: string) => ['entitlement', userId] as const,
  },
  // Live-class / real-time cohort mode (plan 20260702-…).
  liveClass: {
    active: ['live-class', 'active'] as const,
    nextScheduled: ['live-class', 'next-scheduled'] as const,
    enabled: (userId: string) => ['live-class', 'enabled', userId] as const,
    session: (id: string) => ['live-class', 'session', id] as const,
    completers: (activityId: string, presence = '') =>
      ['live-class', 'completers', activityId, presence] as const,
    enabledTenantIds: (userId: string) =>
      ['live-class', 'enabled-tenant-ids', userId] as const,
    mySessions: (tenantId: string) => ['live-class', 'my-sessions', tenantId] as const,
    report: (sessionId: string) => ['live-class', 'report', sessionId] as const,
  },
  // Author review canvas (plan 20260706 — per-unit review+comment surface).
  author: {
    programs: ['author', 'programs'] as const,
    // Locale-keyed: the canvas maps activities through the same lossy
    // `resolveLocalizedSpec` the player does (see the note at the top).
    unitCanvas: (unitId: string, locale: string) =>
      ['author', 'unit-canvas', unitId, { locale }] as const,
    /**
     * Locale-agnostic PREFIX of `unitCanvas`, for invalidation. An edit to the
     * canvas invalidates the unit in EVERY language, not just the one on screen —
     * react-query matches keys by prefix, so this drops all locale variants.
     */
    unitCanvasAll: (unitId: string) => ['author', 'unit-canvas', unitId] as const,
    unitVersions: (unitId: string) => ['author', 'unit-versions', unitId] as const,
    unitComments: (unitId: string) => ['author', 'unit-comments', unitId] as const,
    activityTest: (activityId: string, locale: string) =>
      ['author', 'activity-test', activityId, { locale }] as const,
  },
  // O elenco do aluno (nome/profissão/idade de quem o enunciado cita). Sem
  // locale: são nomes próprios digitados pelo aluno, não conteúdo autorado.
  personalization: {
    mine: ['personalization', 'mine'] as const,
  },
  // Learner-produced work (plan 20260728-itera-artifact-storage, Phase 2/3).
  artifacts: {
    mine: ['artifacts', 'mine'] as const,
    tenant: (tenantId: string) => ['artifacts', 'tenant', tenantId] as const,
    content: (storagePath: string) => ['artifacts', 'content', storagePath] as const,
  },
} as const;
