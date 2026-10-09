/**
 * Where a learner who has just paid should land.
 *
 * Once the checkout is active the catalog is read once (it flags what the
 * learner is already enrolled in) and the answer is one of:
 *   - exactly one enrolled program        → its track;
 *   - none enrolled, exactly one on offer → enroll, then its track;
 *   - anything else, or any failure       → `null` (the page keeps its button to `/`).
 * The paid learner is never blocked: every error path settles on `null`.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { enrollInProgram, getCatalogPrograms } from '@/services/catalog.service';

export interface CheckoutLanding {
  /** True once the lookup has finished (with or without a track to open). */
  settled: boolean;
  /** Path of the track to open, or null to fall back to home. */
  path: string | null;
}

export function useCheckoutLanding(enabled: boolean): CheckoutLanding {
  const qc = useQueryClient();
  const started = useRef(false);
  const [state, setState] = useState<CheckoutLanding>({ settled: false, path: null });

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let cancelled = false;

    const settle = (path: string | null) => {
      if (!cancelled) setState({ settled: true, path });
    };

    (async () => {
      const catalog = await getCatalogPrograms();
      const enrolled = catalog.filter((p) => p.alreadyEnrolled);
      const offered = catalog.filter((p) => !p.alreadyEnrolled);
      const target = enrolled.length === 1 ? enrolled[0] : enrolled.length === 0 && offered.length === 1 ? offered[0] : null;
      if (!target?.slug) return settle(null);
      if (!target.alreadyEnrolled) {
        await enrollInProgram(target.id);
        void qc.invalidateQueries({ queryKey: queryKeys.catalog.all });
        void qc.invalidateQueries({ queryKey: queryKeys.programs.all });
      }
      settle(`/program/${encodeURIComponent(target.slug)}`);
    })().catch(() => settle(null));

    return () => {
      cancelled = true;
      started.current = false;
    };
  }, [enabled, qc]);

  return state;
}
