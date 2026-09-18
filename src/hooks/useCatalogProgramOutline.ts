/**
 * Syllabus of one self-serve catalog program for a visitor who is not enrolled.
 * `data` is null when no live catalog program has this slug.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getCatalogProgramOutline } from '@/services/catalogOutline.service';

export function useCatalogProgramOutline(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.catalog.outline(slug ?? ''),
    queryFn: () => getCatalogProgramOutline(slug as string),
    enabled: Boolean(slug),
  });
}
