/**
 * Reads straight from a public Solana node, from the visitor's browser. Nothing here goes through
 * Itera's servers: that is the point. Devnet only.
 */
export const PUBLIC_RPC = 'https://api.devnet.solana.com';

export class ChainReadError extends Error {}

export async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(PUBLIC_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  } catch (error) {
    throw new ChainReadError(error instanceof Error ? error.message : 'request failed');
  }
  if (!response.ok) throw new ChainReadError(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new ChainReadError(body.error.message ?? 'rpc error');
  return body.result as T;
}

/** The exact request body of a call, to copy into curl. */
export const rpcBody = (method: string, params: unknown[]): string => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
export const curlFor = (method: string, params: unknown[]): string => `curl -s ${PUBLIC_RPC} -H 'Content-Type: application/json' -d '${rpcBody(method, params)}'`;

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export interface RawAccount {
  address: string;
  /** The program that owns the account. */
  owner: string;
  lamports: number;
  executable: boolean;
  data: Uint8Array;
  /** The slot the node answered at. */
  slot: number;
}

export const accountParams = (address: string, slice?: { offset: number; length: number }): unknown[] => [address, { encoding: 'base64', commitment: 'confirmed', ...(slice ? { dataSlice: slice } : {}) }];

/** The account as the node has it now. `null` when it does not exist. */
export async function readAccount(address: string, slice?: { offset: number; length: number }): Promise<RawAccount | null> {
  const result = await rpcCall<{ context: { slot: number }; value: { data: [string, string]; owner: string; lamports: number; executable: boolean } | null }>('getAccountInfo', accountParams(address, slice));
  if (!result.value) return null;
  return { address, owner: result.value.owner, lamports: result.value.lamports, executable: result.value.executable, data: fromBase64(result.value.data[0]), slot: result.context.slot };
}

export interface RawTransaction {
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Every account that signed, in order. The first one paid the fee. */
  signers: string[];
  feeLamports: number;
  failed: boolean;
  /** The programs the transaction called. */
  programs: string[];
  logs: string[];
}

export const transactionParams = (signature: string): unknown[] => [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }];

/** A confirmed transaction as the node has it. `null` when the node does not know it. */
export async function readTransaction(signature: string): Promise<RawTransaction | null> {
  const tx = await rpcCall<{
    slot: number;
    blockTime: number | null;
    meta: { fee: number; err: unknown; logMessages?: string[] } | null;
    transaction: { message: { accountKeys: string[]; header: { numRequiredSignatures: number }; instructions: Array<{ programIdIndex: number }> } };
  } | null>('getTransaction', transactionParams(signature));
  if (!tx) return null;
  const { accountKeys, header, instructions } = tx.transaction.message;
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    signers: accountKeys.slice(0, header.numRequiredSignatures),
    feeLamports: tx.meta?.fee ?? 0,
    failed: Boolean(tx.meta?.err),
    programs: [...new Set(instructions.map((instruction) => accountKeys[instruction.programIdIndex]))],
    logs: tx.meta?.logMessages ?? [],
  };
}
