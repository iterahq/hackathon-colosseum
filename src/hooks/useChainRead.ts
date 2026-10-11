import { useQuery } from '@tanstack/react-query';
import { readAccount, readTransaction } from '@/lib/chain/rpc';
import { queryKeys } from '@/lib/queryKeys';

export function useChainAccount(address: string, slice?: { offset: number; length: number }, enabled = true) {
  return useQuery({ queryKey: queryKeys.chain.account(address, slice), queryFn: () => readAccount(address, slice), enabled, staleTime: 15_000 });
}

export function useChainTransaction(signature: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.chain.transaction(signature), queryFn: () => readTransaction(signature), enabled, staleTime: 60_000 });
}

async function fetchPublished(path: string): Promise<Response> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

export function usePublishedText(path: string) {
  return useQuery({ queryKey: queryKeys.chain.published(path), queryFn: async () => (await fetchPublished(path)).text(), staleTime: Infinity });
}

export function usePublishedJson<T>(path: string) {
  return useQuery({ queryKey: queryKeys.chain.published(path), queryFn: async () => (await (await fetchPublished(path)).json()) as T, staleTime: Infinity });
}

export async function fetchPublishedBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetchPublished(path)).arrayBuffer());
}
