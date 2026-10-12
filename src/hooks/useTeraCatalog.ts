/** The Tera catalog. The bundled copy is on screen from the first frame; the live one replaces it when it arrives. */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { FALLBACK_CATALOG, getTeraCatalog } from '@/services/teraCatalog.service';
import type { TeraCatalog } from '@/types/tera';

export function useTeraCatalog(): TeraCatalog {
  return useQuery({ queryKey: queryKeys.tera.catalog, queryFn: getTeraCatalog, retry: false, staleTime: 5 * 60_000, placeholderData: FALLBACK_CATALOG }).data ?? FALLBACK_CATALOG;
}
