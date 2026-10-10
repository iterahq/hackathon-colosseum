/** The Circuito counter. componente → hook → service → edge function. A failed read shows nothing. */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { getCircuit } from '@/services/circuit.service';

export function useCircuit(wallet: string | null) {
  return useQuery({ queryKey: queryKeys.circuit.counter(wallet ?? 'all'), queryFn: () => getCircuit(wallet), retry: false, staleTime: 15_000 });
}
