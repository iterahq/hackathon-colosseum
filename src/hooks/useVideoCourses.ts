/**
 * The video course library and the learner's watched lessons, with an optimistic watched toggle.
 * componente → hook → service → Supabase.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import { getMyVideoProgress, getVideoCourses, setLessonWatched } from '@/services/videoCourses.service';
import type { VideoProgress } from '@/types/videoCourses';

type ProgressCache = Record<string, number>;

export function useVideoCourses() {
  const { session, configured } = useAuth();
  const userId = session?.user?.id ?? 'anon';
  const signedIn = configured && Boolean(session);
  const courses = useQuery({ queryKey: queryKeys.videoCourses.list, queryFn: getVideoCourses, enabled: configured });
  const mine = useQuery({ queryKey: queryKeys.videoCourses.progress(userId), queryFn: getMyVideoProgress, enabled: signedIn });
  const progress: VideoProgress = useMemo(() => new Map(Object.entries(mine.data ?? {})), [mine.data]);

  return {
    courses: courses.data ?? [],
    progress,
    isPending: courses.isPending || (signedIn && mine.isPending),
    isError: courses.isError || mine.isError,
    refetch: () => void Promise.all([courses.refetch(), mine.refetch()]),
  };
}

export function useToggleWatched() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.videoCourses.progress(session?.user?.id ?? 'anon');

  return useMutation({
    mutationFn: ({ lessonId, watched }: { lessonId: string; watched: boolean }) => setLessonWatched(lessonId, watched),
    onMutate: async ({ lessonId, watched }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProgressCache>(key);
      const next = { ...(previous ?? {}) };
      if (watched) next[lessonId] = Date.now();
      else delete next[lessonId];
      queryClient.setQueryData<ProgressCache>(key, next);
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(key, context?.previous ?? {}),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
