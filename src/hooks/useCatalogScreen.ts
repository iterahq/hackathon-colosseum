/**
 * Everything the universal catalog screen takes from the web: the catalog query, who may enroll, the
 * enrollment, where a tap leads, and the one place that words the subscribe offer. The screen draws; this
 * decides. componente → hook → service.
 *
 * Visitor mode (2026-09-18): a signed-in user with no active subscription still reaches the page
 * (RequireSubscription mode="preview") and browses the SAME cards, locked. The enroll button never
 * renders and `useEnroll` never runs for them. Inside the shell the offer is left out (`useShellSurface`).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listStateOf, type EnrollStates } from '@iterahq/shell-core';
import type { CatalogScreenProps } from '@iterahq/screens/catalog';
import { useCatalog, useEnroll } from '@/hooks/useCatalog';
import { useAccessLevel } from '@/hooks/useAccessLevel';
import { useShellSurface } from '@/hooks/useShellSurface';
import { useI18n } from '@/i18n';
import { isUnreachable } from '@/lib/networkFailure';

const SUBSCRIBE = '/subscribe';

export function useCatalogScreen(): Omit<CatalogScreenProps, 'header' | 'icon'> {
  const { t, tText } = useI18n();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const enroll = useEnroll();
  const { level } = useAccessLevel();
  const surface = useShellSurface();
  const programs = catalog.data ?? [];

  const open = (slug: string) => navigate(`/program/${slug}`);
  const offer = surface === 'web' ? { label: t('catalog.locked.cta'), link: { href: SUBSCRIBE, go: () => navigate(SUBSCRIBE) } } : undefined;
  // One state per course, as when each card owned its mutation: `enroll` itself only reports the call made last.
  const [enrolling, setEnrolling] = useState<EnrollStates>({});
  const state = listStateOf(
    { isPending: catalog.isPending, isError: catalog.isError, unreachable: isUnreachable(catalog) },
    programs,
    { visitor: level === 'visitor', offer, enrolling, t, tText },
  );

  const onEnroll = async (programId: string) => {
    if (enrolling[programId]?.pending) return;
    const settle = (failed: boolean) => setEnrolling((all) => ({ ...all, [programId]: { pending: false, failed } }));
    setEnrolling((all) => ({ ...all, [programId]: { pending: true, failed: false } }));
    try {
      await enroll.mutateAsync(programId);
      settle(false);
      // On success the user holds a membership; open the course straight away.
      const slug = programs.find((p) => p.id === programId)?.slug;
      if (slug) open(slug);
    } catch {
      settle(true);
    }
  };

  return { t, state, onOpenProgram: open, onEnroll, onRetry: () => void catalog.refetch() };
}
