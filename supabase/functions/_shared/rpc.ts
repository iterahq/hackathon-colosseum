const RPC_TIMEOUT_MS = 8_000;

export class RpcError extends Error {}

/** The node answered and refused the call (a failed simulation, an unknown blockhash). */
export class RpcNodeError extends RpcError {
  constructor(method: string, readonly nodeMessage: string) {
    super(`${method}: ${nodeMessage}`);
  }
}

/**
 * The answer of `work` if it comes within `ms`, else `null`. The work is not cancelled: a caller that
 * wants its effect anyway hands the same promise to the runtime's background queue. For reads of the
 * chain that improve an answer and must never hold it.
 */
export async function withinMs<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

export function rpcUrl(): string {
  return Deno.env.get('SOLANA_RPC_URL') ?? 'https://api.devnet.solana.com';
}

/** One JSON-RPC call to the Solana node. Throws `RpcError` on a transport or node error. */
export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RpcError(`${method}: ${error instanceof Error ? error.message : 'request failed'}`);
  }
  if (!response.ok) throw new RpcError(`${method}: HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new RpcNodeError(method, payload.error.message ?? 'rpc error');
  return payload.result as T;
}

export async function balanceOf(address: string): Promise<bigint> {
  const result = await rpc<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }]);
  return BigInt(result.value);
}

export function blockHeight(): Promise<number> {
  return rpc<number>('getBlockHeight', [{ commitment: 'confirmed' }]);
}

export async function latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const result = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  return result.value;
}
