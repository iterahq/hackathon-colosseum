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
    bySlug: (slug: string) => ['programs', slug] as const,
  },
  // Self-serve catalog (membership-independent, via SECURITY DEFINER RPC).
  catalog: {
    all: ['catalog'] as const,
  },
  lesson: {
    byId: (id: string) => ['lesson', id] as const,
    next: (id: string) => ['lesson', id, 'next'] as const,
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
    unitCanvas: (unitId: string) => ['author', 'unit-canvas', unitId] as const,
    unitVersions: (unitId: string) => ['author', 'unit-versions', unitId] as const,
    unitComments: (unitId: string) => ['author', 'unit-comments', unitId] as const,
    activityTest: (activityId: string) => ['author', 'activity-test', activityId] as const,
  },
} as const;
