/** Answer of the public `gate-check` function: the escrow program asked to accept a wallet. */
export interface GateVerdict {
  refused: boolean;
  errorCode: number | null;
  errorHex: string | null;
  /** The program's own name for the error (`certification_not_owned_by_claimant`…); `null` for a failure that is not the program's. */
  errorName: string | null;
}

export interface GateCheck {
  mode: 'simulated' | 'sent';
  programId: string;
  bounty: { slug: string; title: string; trail: string; minDays: number };
  escrow: string;
  claimant: { address: string; kind: 'named' | 'made_for_this_check' };
  certification: { address: string; kind: 'own' | 'another_wallets' | 'not_a_certification'; url: string | null };
  /** `null`: a sent transaction the node has not confirmed yet. */
  verdict: GateVerdict | null;
  logs: string[];
  /** A simulated check: the shell command that asks a public node the same question. */
  repeatWith: string | null;
  /** A sent check: the failed transaction itself. */
  signature: string | null;
  explorerUrl: string | null;
}
