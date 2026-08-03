/**
 * TanStack Query hooks for the author review canvas (plan 20260706, Phase 4).
 * componente → hook (useQuery) → service → fetch. NO realtime — the canvas
 * re-reads via a manual Refresh (`refetch`) which also surfaces external MCP
 * edits (ADR-1 loop). Mutations optimistically patch the cache.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n';
import {
  getUnitCanvas,
  getAuthorPrograms,
  getActivityById,
  isActivityNotFoundError,
} from '@/services/authorCanvas.service';
import {
  fetchUnitVersions,
  fetchUnitComments,
  ensureCurrentUnitVersion,
  bumpUnitVersion,
  createActivityComment,
  setCommentResolved,
  deleteActivityComment,
  setActivityStatus,
  setActivityArtifactPolicy,
  type CreateCommentInput,
} from '@/services/comments.service';
import type { ActivityComment, UnitVersion } from '@/types/comments';

/** The author's programs + units for the `/author` home. */
export function useAuthorPrograms() {
  const { configured, session } = useAuth();
  return useQuery({
    queryKey: queryKeys.author.programs,
    queryFn: getAuthorPrograms,
    enabled: configured && Boolean(session),
  });
}

/** One unit's deep graph (rows=lessons, columns=activities). */
export function useUnitCanvas(unitId: string | undefined) {
  const { configured, session } = useAuth();
  // Authored content is locale-collapsed while mapping — see queryKeys.ts.
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.author.unitCanvas(unitId ?? '', locale),
    queryFn: () => getUnitCanvas(unitId!),
    enabled: configured && Boolean(session) && Boolean(unitId),
  });
}

/**
 * A single activity for the standalone TEST harness route.
 *
 * A missing/invisible id is PERMANENT (deleted activity, stale deep-link, another
 * tenant's row) — retrying it just holds the spinner on screen for the whole
 * backoff window with nothing to show for it. Fail fast so the page can render a
 * real "not found" state; keep the default retries for genuine transport errors.
 */
export function useActivity(activityId: string | undefined) {
  const { configured, session } = useAuth();
  // Authored content is locale-collapsed while mapping — see queryKeys.ts.
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.author.activityTest(activityId ?? '', locale),
    queryFn: () => getActivityById(activityId!),
    enabled: configured && Boolean(session) && Boolean(activityId),
    retry: (failureCount, error) => !isActivityNotFoundError(error) && failureCount < 3,
  });
}

export function useUnitVersions(unitId: string | undefined) {
  const { configured, session } = useAuth();
  return useQuery({
    queryKey: queryKeys.author.unitVersions(unitId ?? ''),
    queryFn: () => fetchUnitVersions(unitId!),
    enabled: configured && Boolean(session) && Boolean(unitId),
  });
}

export function useUnitComments(unitId: string | undefined) {
  const { configured, session } = useAuth();
  return useQuery({
    queryKey: queryKeys.author.unitComments(unitId ?? ''),
    queryFn: () => fetchUnitComments(unitId!),
    enabled: configured && Boolean(session) && Boolean(unitId),
  });
}

/**
 * Create a comment. Ensures the unit has a current version first
 * (auto-creating v1 when none exists), then stamps the comment with it.
 */
export function useCreateComment(unitId: string | undefined, tenantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      programId: string;
      lessonId: string;
      activityId: string;
      body: string;
      anchorX?: number | null;
      anchorY?: number | null;
    }): Promise<ActivityComment> => {
      if (!unitId || !tenantId) throw new Error('No unit/tenant');
      const current = await ensureCurrentUnitVersion(unitId, tenantId);
      const payload: CreateCommentInput = {
        tenantId,
        programId: input.programId,
        unitId,
        lessonId: input.lessonId,
        activityId: input.activityId,
        unitVersionId: current.id,
        body: input.body,
        anchorX: input.anchorX ?? null,
        anchorY: input.anchorY ?? null,
      };
      return createActivityComment(payload);
    },
    onSuccess: (created) => {
      qc.setQueryData<ActivityComment[]>(queryKeys.author.unitComments(unitId ?? ''), (prev) =>
        prev ? [...prev, created] : [created],
      );
      // A version may have just been auto-created — refresh the list.
      qc.invalidateQueries({ queryKey: queryKeys.author.unitVersions(unitId ?? '') });
    },
  });
}

export function useToggleResolved(unitId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      setCommentResolved(id, resolved),
    onSuccess: (updated) => {
      qc.setQueryData<ActivityComment[]>(queryKeys.author.unitComments(unitId ?? ''), (prev) =>
        (prev ?? []).map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useDeleteComment(unitId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivityComment(id),
    onSuccess: (_void, id) => {
      qc.setQueryData<ActivityComment[]>(queryKeys.author.unitComments(unitId ?? ''), (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      );
    },
  });
}

export function useBumpVersion(unitId: string | undefined, tenantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label?: string): Promise<UnitVersion> => {
      if (!unitId || !tenantId) throw new Error('No unit/tenant');
      await ensureCurrentUnitVersion(unitId, tenantId);
      return bumpUnitVersion(unitId, tenantId, label);
    },
    onSuccess: (created) => {
      qc.setQueryData<UnitVersion[]>(queryKeys.author.unitVersions(unitId ?? ''), (prev) =>
        prev ? [...prev, created] : [created],
      );
    },
  });
}

/** Publish / unpublish an activity (flips itera.activities.status directly). */
export function useSetActivityStatus(unitId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, status }: { activityId: string; status: 'draft' | 'published' }) =>
      setActivityStatus(activityId, status),
    onSuccess: () => {
      // Re-read the canvas so status badges reflect the flip.
      qc.invalidateQueries({ queryKey: queryKeys.author.unitCanvasAll(unitId ?? '') });
    },
  });
}

/**
 * Set an activity's artifact policy — the authoring answer to "what persists?"
 * (plan 20260728-itera-artifact-storage, migration 0027).
 *
 * Invalidates the canvas so the cell's badge reflects the new decision without
 * a manual reload, mirroring `useSetActivityStatus` exactly.
 */
export function useSetArtifactPolicy(unitId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      activityId,
      policy,
    }: {
      activityId: string;
      policy: Record<string, unknown>;
    }) => setActivityArtifactPolicy(activityId, policy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.author.unitCanvasAll(unitId ?? '') });
    },
  });
}
